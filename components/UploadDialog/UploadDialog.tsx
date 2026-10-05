"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Send, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/common/toast";
import { useChatSession, useSession } from "@/components/FileManager/session-context";
import { keys } from "@/components/FileManager/hooks";
import type { UploadHandle } from "@/lib/api/client";
import { haptic, openTelegramLink } from "@/lib/telegram/webapp";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type Status = "queued" | "uploading" | "done" | "error" | "cancelled";

interface UploadItem {
  id: number;
  file: File;
  progress: number;
  status: Status;
  error?: string;
  handle?: UploadHandle;
}

interface Props {
  open: boolean;
  folderId: string | null;
  folderName: string;
  onOpenChange: (open: boolean) => void;
}

const CONCURRENCY = 2;

export function UploadDialog({ open, folderId, folderName, onOpenChange }: Props) {
  const { api } = useSession();
  const session = useChatSession();
  const toast = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItemsState] = useState<UploadItem[]>([]);
  // The ref is the source of truth so the scheduler can read the latest list synchronously.
  const itemsRef = useRef<UploadItem[]>([]);
  const setItems = useCallback((fn: (prev: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItemsState(itemsRef.current);
  }, []);
  const [dragging, setDragging] = useState(false);
  const [telegramMode, setTelegramMode] = useState<null | { link: string; folderPath: string }>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const counter = useRef(0);
  const limitMb = Math.floor(session.limits.maxUploadBytes / 1048576);

  const refreshFolder = useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.folder(session.chat.id, folderId) });
  }, [qc, session.chat.id, folderId]);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      itemsRef.current.forEach((i) => i.status === "uploading" && i.handle?.abort());
      setItems(() => []);
      setTelegramMode(null);
    }
    onOpenChange(o);
  };

  // While waiting for files sent via Telegram, poll the folder so they appear as they arrive.
  useEffect(() => {
    if (!open || !telegramMode) return;
    const t = window.setInterval(refreshFolder, 4000);
    return () => window.clearInterval(t);
  }, [open, telegramMode, refreshFolder]);

  const update = useCallback(
    (id: number, patch: Partial<UploadItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    [setItems],
  );

  /** Scheduler: keep up to CONCURRENCY uploads running. Called whenever the queue changes. */
  function pump() {
    const running = itemsRef.current.filter((i) => i.status === "uploading").length;
    if (running >= CONCURRENCY) return;
    const next = itemsRef.current.find((i) => i.status === "queued");
    if (!next) return;
    const handle = api.upload(next.file, folderId, (fraction) => update(next.id, { progress: fraction }));
    update(next.id, { status: "uploading", progress: 0, handle, error: undefined });
    handle.promise
      .then(() => {
        update(next.id, { status: "done", progress: 1 });
        haptic("success");
        refreshFolder();
      })
      .catch((err: Error & { code?: string }) => {
        if (err.code === "ABORTED") update(next.id, { status: "cancelled" });
        else {
          update(next.id, { status: "error", error: err.message });
          haptic("error");
        }
      })
      .finally(() => pump());
    pump();
  }

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const added: UploadItem[] = list.map((file) => {
      const tooBig = file.size > session.limits.maxUploadBytes;
      return {
        id: ++counter.current,
        file,
        progress: 0,
        status: tooBig ? "error" : "queued",
        error: tooBig ? `Larger than the ${limitMb} MB limit — use “Upload via Telegram”.` : undefined,
      };
    });
    setItems((prev) => [...prev, ...added]);
    pump();
  };

  const startTelegramUpload = async () => {
    setCreatingLink(true);
    try {
      const res = await api.createTelegramUpload(folderId);
      setTelegramMode({ link: res.link, folderPath: res.folderPath });
      openTelegramLink(res.link);
    } catch (err) {
      toast({ title: "Could not start Telegram upload", description: (err as Error).message, variant: "error" });
    } finally {
      setCreatingLink(false);
    }
  };

  const summary = useMemo(() => {
    const done = items.filter((i) => i.status === "done").length;
    const active = items.some((i) => i.status === "uploading" || i.status === "queued");
    return { done, active, total: items.length };
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-md flex-col gap-0 p-0" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>to {folderName}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {telegramMode ? (
            <div className="rounded-xl border bg-muted/50 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Waiting for files from Telegram…</p>
                  <p className="mt-1 text-muted-foreground">
                    Send your files to <span className="font-medium text-foreground">@{session.botUsername}</span> and they will appear in{" "}
                    <span className="font-medium text-foreground">{telegramMode.folderPath}</span>. Send <code>/done</code> when finished.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => openTelegramLink(telegramMode.link)}>
                    <Send /> Open chat with bot
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                  dragging ? "border-primary bg-primary/10" : "border-border bg-muted/40 active:bg-muted",
                )}
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Upload className="size-6" />
                </div>
                <div className="text-sm font-medium">Select files</div>
                <div className="text-xs text-muted-foreground">Up to {limitMb} MB each · stored by Telegram</div>
              </button>

              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full justify-start gap-3 py-5" onClick={startTelegramUpload} disabled={creatingLink}>
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  {creatingLink ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">Upload via Telegram</div>
                  <div className="text-xs font-normal text-muted-foreground">Large files · send them to the bot in chat</div>
                </div>
              </Button>
            </>
          )}

          {items.length > 0 && (
            <ul className="mt-4 space-y-3">
              {items.map((i) => (
                <li key={i.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{i.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(i.file.size)}
                        {i.status === "uploading" && ` · ${Math.round(i.progress * 100)}%`}
                        {i.status === "cancelled" && " · cancelled"}
                      </div>
                    </div>
                    {i.status === "done" && <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />}
                    {i.status === "error" && <AlertCircle className="size-5 text-destructive" />}
                    {(i.status === "error" || i.status === "cancelled") && i.file.size <= session.limits.maxUploadBytes && (
                      <Button variant="ghost" size="icon-sm" aria-label="Retry" onClick={() => {
                          update(i.id, { status: "queued", error: undefined });
                          pump();
                        }}>
                        <RotateCcw />
                      </Button>
                    )}
                    {(i.status === "uploading" || i.status === "queued") && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancel"
                        onClick={() => (i.handle ? i.handle.abort() : update(i.id, { status: "cancelled" }))}
                      >
                        <X />
                      </Button>
                    )}
                    {(i.status === "done" || i.status === "error" || i.status === "cancelled") && (
                      <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))}>
                        <X />
                      </Button>
                    )}
                  </div>
                  {(i.status === "uploading" || i.status === "queued") && <Progress value={i.progress * 100} className="mt-2 h-1.5" />}
                  {i.error && <p className="mt-1.5 text-xs text-destructive">{i.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {summary.total > 0 && `${summary.done}/${summary.total} uploaded`}
          </span>
          <Button variant={summary.active ? "ghost" : "default"} onClick={() => handleOpenChange(false)}>
            {summary.active ? "Cancel all" : telegramMode ? "I'm done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
