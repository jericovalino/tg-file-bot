"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderPlus, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyFolder, ErrorMessage, FullScreenSpinner, LoadingList, CenterMessage } from "@/components/common/states";
import { useToast } from "@/components/common/toast";
import { CreateFolderDialog } from "@/components/CreateFolderDialog/CreateFolderDialog";
import { UploadDialog } from "@/components/UploadDialog/UploadDialog";
import { RenameDialog } from "@/components/dialogs/RenameDialog";
import { DeleteDialog } from "@/components/dialogs/DeleteDialog";
import { MoveDialog } from "@/components/dialogs/MoveDialog";
import { FolderRow } from "@/components/FolderList/FolderRow";
import { FileRow } from "@/components/FileList/FileRow";
import type { ItemAction } from "@/components/ContextMenu/ItemMenu";
import { ClientApiError } from "@/lib/api/client";
import { copyText, downloadViaTelegram, getWebApp, haptic, openExternal, openTelegramLink } from "@/lib/telegram/webapp";
import type { FileDto, FolderDto } from "@/lib/types";
import { ChatPicker } from "./ChatPicker";
import { Header } from "./Header";
import { PreviewSheet } from "./PreviewSheet";
import { SearchView } from "./SearchView";
import { useFile, useFolder, type Item } from "./hooks";
import { useSession } from "./session-context";

export function FileManager() {
  const { state, reauth } = useSession();
  if (state.status === "loading") return <FullScreenSpinner label="Connecting to Telegram…" />;
  if (state.status === "not-telegram") return <NotInTelegram />;
  if (state.status === "error") return <SessionError error={state.error} onRetry={() => void reauth()} />;
  if (state.status === "select-chat") return <ChatPicker data={state.data} />;
  return <Browser key={state.session.chat.id} />;
}

function NotInTelegram() {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return (
    <CenterMessage
      title="Open this app from Telegram"
      description={
        <>
          This file manager runs as a Telegram Mini App. Add {bot ? <span className="font-medium text-foreground">@{bot}</span> : "the bot"} to a group and send{" "}
          <code>/files</code> there.
        </>
      }
      action={bot ? <Button onClick={() => window.open(`https://t.me/${bot}`, "_blank", "noopener")}>Open @{bot}</Button> : undefined}
    />
  );
}

function SessionError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const code = error instanceof ClientApiError ? error.code : undefined;
  const title =
    code === "NOT_A_MEMBER" ? "You're not a member of this group" : code === "BOT_NOT_IN_CHAT" ? "The bot was removed from this group" : code === "INVALID_INIT_DATA" ? "Please reopen the app" : "Could not sign in";
  return <ErrorMessage error={Object.assign(new Error(error.message), { name: title })} onRetry={onRetry} />;
}

function Browser() {
  const { state, api, can } = useSession();
  const session = state.status === "ready" ? state.session : null;
  const toast = useToast();

  // Navigation ------------------------------------------------------------------------------------
  const [folderId, setFolderId] = useState<string | null>(session?.target.folderId ?? null);
  const historyRef = useRef<(string | null)[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<FileDto | null>(null);
  const [busy, setBusy] = useState<ItemAction | null>(null);

  // Dialogs ---------------------------------------------------------------------------------------
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renaming, setRenaming] = useState<Item | null>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const listing = useFolder(folderId);
  const deepLinkedFile = useFile(session?.target.fileId ?? null);
  const openedDeepLink = useRef(false);
  useEffect(() => {
    if (deepLinkedFile.data && !openedDeepLink.current) {
      openedDeepLink.current = true;
      setPreview(deepLinkedFile.data);
    }
  }, [deepLinkedFile.data]);

  const navigate = useCallback(
    (next: string | null, push = true) => {
      if (push) historyRef.current.push(folderId);
      setFolderId(next);
      setSearchMode(false);
      haptic("selection");
      window.scrollTo({ top: 0 });
    },
    [folderId],
  );

  const goBack = useCallback(() => {
    if (preview) return setPreview(null);
    if (searchMode) return setSearchMode(false);
    const prev = historyRef.current.pop();
    if (prev !== undefined) {
      setFolderId(prev);
      return;
    }
    // No history (deep link): climb to the parent via breadcrumbs.
    const crumbs = listing.data?.breadcrumbs ?? [];
    setFolderId(crumbs.length > 1 ? crumbs[crumbs.length - 2].id : null);
  }, [preview, searchMode, listing.data]);

  const canGoBack = folderId !== null || searchMode || !!preview;

  // Telegram BackButton mirrors in-app navigation.
  useEffect(() => {
    const wa = getWebApp();
    if (!wa?.BackButton) return;
    if (canGoBack) wa.BackButton.show();
    else wa.BackButton.hide();
    const handler = () => goBack();
    wa.BackButton.onClick(handler);
    return () => wa.BackButton.offClick(handler);
  }, [canGoBack, goBack]);

  // Actions ---------------------------------------------------------------------------------------
  const deepLink = useCallback((item: Item) => `${session?.deepLinkBase ?? ""}${item.kind === "file" ? "file_" : "folder_"}${item.data.id}`, [session]);

  const sendToMe = useCallback(
    async (item: Item) => {
      if (item.kind !== "file") return;
      try {
        setBusy("send");
        await api.sendToTelegram(item.data.id);
        haptic("success");
        toast({
          title: "Sent to your chat with the bot",
          variant: "success",
          action: { label: "Open chat", onClick: () => openTelegramLink(`https://t.me/${session?.botUsername}`) },
        });
      } catch (err) {
        haptic("error");
        const e = err as ClientApiError;
        const startLink = (e.details as { startLink?: string } | undefined)?.startLink;
        toast({
          title: e.code === "USER_NOT_REACHABLE" ? "Start the bot first" : "Could not send file",
          description: e.message,
          variant: "error",
          action: startLink ? { label: "Open bot", onClick: () => openTelegramLink(startLink) } : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [api, session, toast],
  );

  const handleAction = useCallback(
    async (action: ItemAction, item: Item) => {
      switch (action) {
        case "open":
          if (item.kind === "folder") return navigate(item.data.id);
          if (preview?.id === item.data.id && item.data.browserDownloadable) {
            // "Open" from the preview: hand the file to the system (PDFs etc.).
            try {
              setBusy("open");
              const dl = await api.getDownloadUrl(item.data.id);
              openExternal(`${dl.url}&disposition=inline`);
            } catch (err) {
              toast({ title: "Could not open file", description: (err as Error).message, variant: "error" });
            } finally {
              setBusy(null);
            }
            return;
          }
          return setPreview(item.data);
        case "download": {
          if (item.kind !== "file") return;
          if (!item.data.browserDownloadable) {
            toast({
              title: "Too large for browser download",
              description: "Telegram bots can only serve files up to 20 MB directly. Use “Send to me in Telegram”.",
              action: { label: "Send to me", onClick: () => void sendToMe(item) },
            });
            return;
          }
          try {
            setBusy("download");
            const dl = await api.getDownloadUrl(item.data.id);
            await downloadViaTelegram(dl.url, dl.fileName);
          } catch (err) {
            haptic("error");
            toast({ title: "Download failed", description: (err as Error).message, variant: "error" });
          } finally {
            setBusy(null);
          }
          return;
        }
        case "send":
          return sendToMe(item);
        case "rename":
          return setRenaming(item);
        case "move":
          return setMoving(item);
        case "delete":
          return setDeleting(item);
        case "copy-link": {
          const link = deepLink(item);
          const ok = await copyText(link);
          haptic(ok ? "success" : "error");
          toast(ok ? { title: "Link copied", description: link, variant: "success" } : { title: "Copy not available", description: link, durationMs: 8000 });
          return;
        }
      }
    },
    [api, navigate, preview, toast, deepLink, sendToMe],
  );

  if (!session) return null;
  const data = listing.data;
  const title = data?.folder?.name ?? session.chat.title;
  const isEmpty = data && data.folders.length === 0 && data.files.length === 0;
  const canUpload = can("files.upload");
  const canCreateFolder = can("folders.create");

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <Header
        title={title}
        subtitle={data?.folder ? session.chat.title : "Group Files"}
        breadcrumbs={data?.breadcrumbs ?? []}
        canGoBack={canGoBack}
        onBack={goBack}
        onNavigate={(id) => navigate(id)}
        searchMode={searchMode}
        searchQuery={query}
        onSearchChange={setQuery}
        onOpenSearch={() => {
          setSearchMode(true);
          haptic("light");
        }}
        onCloseSearch={() => setSearchMode(false)}
      />

      <main className="flex flex-1 flex-col">
        {searchMode ? (
          <SearchView query={query} onOpenFolder={(f) => navigate(f.id)} onOpenFile={setPreview} onAction={handleAction} />
        ) : listing.isLoading ? (
          <LoadingList />
        ) : listing.error ? (
          <ErrorMessage error={listing.error as Error} onRetry={() => void listing.refetch()} />
        ) : isEmpty ? (
          <EmptyFolder canUpload={canUpload} onUpload={() => setUploadOpen(true)} />
        ) : (
          <div className="pb-28">
            {data!.folders.length > 0 && (
              <section className="mt-2 divide-y bg-card">
                {data!.folders.map((f: FolderDto) => (
                  <FolderRow key={f.id} folder={f} onOpen={(folder) => navigate(folder.id)} onAction={handleAction} />
                ))}
              </section>
            )}
            {data!.files.length > 0 && (
              <section className="mt-2 divide-y bg-card">
                {data!.files.map((f: FileDto) => (
                  <FileRow key={f.id} file={f} mediaToken={session.mediaToken} highlighted={session.target.fileId === f.id} onOpen={setPreview} onAction={handleAction} />
                ))}
              </section>
            )}
            {listing.isFetching && <p className="py-3 text-center text-xs text-muted-foreground">Refreshing…</p>}
          </div>
        )}
      </main>

      {!searchMode && (canUpload || canCreateFolder) && (
        <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] z-40">
          {canUpload && canCreateFolder ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-lg" className="size-14 rounded-full shadow-lg" aria-label="Add">
                  <Plus className="size-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="min-w-44">
                <DropdownMenuItem onSelect={() => setUploadOpen(true)}>
                  <Upload /> Upload files
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                  <FolderPlus /> New folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="icon-lg" className="size-14 rounded-full shadow-lg" aria-label={canUpload ? "Upload files" : "New folder"} onClick={() => (canUpload ? setUploadOpen(true) : setCreateOpen(true))}>
              {canUpload ? <Upload className="size-6" /> : <FolderPlus className="size-6" />}
            </Button>
          )}
        </div>
      )}

      <CreateFolderDialog open={createOpen} parentId={folderId} parentName={title} onOpenChange={setCreateOpen} />
      <UploadDialog open={uploadOpen} folderId={folderId} folderName={title} onOpenChange={setUploadOpen} />
      <RenameDialog item={renaming} onClose={() => setRenaming(null)} />
      <MoveDialog item={moving} onClose={() => setMoving(null)} />
      <DeleteDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(item) => {
          if (item.kind === "file" && preview?.id === item.data.id) setPreview(null);
          if (item.kind === "folder" && folderId === item.data.id) goBack();
        }}
      />
      <PreviewSheet file={preview} onClose={() => setPreview(null)} onAction={handleAction} busy={busy} />
    </div>
  );
}
