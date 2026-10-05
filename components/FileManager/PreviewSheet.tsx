"use client";

import { useState } from "react";
import { Download, ExternalLink, Link2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FileIcon } from "@/components/common/file-icon";
import { ItemMenu, type ItemAction } from "@/components/ContextMenu/ItemMenu";
import type { Item } from "./hooks";
import { useChatSession, useSession } from "./session-context";
import { mediaUrl } from "@/lib/api/client";
import type { FileDto } from "@/lib/types";
import { fileCategory, formatBytes, formatDate, formatDuration, userDisplayName } from "@/lib/utils/format";

interface Props {
  file: FileDto | null;
  onClose: () => void;
  onAction: (action: ItemAction, item: Item) => void;
  busy?: ItemAction | null;
}

export function PreviewSheet(props: Props) {
  // Remount per file so media error state resets.
  return <PreviewSheetInner key={props.file?.id ?? "none"} {...props} />;
}

function PreviewSheetInner({ file, onClose, onAction, busy }: Props) {
  const session = useChatSession();
  const { can } = useSession();
  const [mediaError, setMediaError] = useState(false);

  if (!file) return null;
  const item: Item = { kind: "file", data: file };
  const category = fileCategory(file);
  const inlineUrl = mediaUrl(file.id, session.mediaToken, "inline");
  const canDownload = can("files.download");
  const canInline = file.browserDownloadable && !mediaError;
  const meta = [formatBytes(file.fileSize), file.duration ? formatDuration(file.duration) : "", file.width && file.height ? `${file.width}×${file.height}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet open={!!file} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]" showCloseButton={false}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="flex-row items-start gap-3 px-4 pt-3 pb-2 text-left">
          <FileIcon file={file} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-[15px] leading-5">{file.fileName}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {[meta, formatDate(file.createdAt), userDisplayName(file.createdBy)].filter(Boolean).join(" · ")}
            </SheetDescription>
          </div>
          <ItemMenu item={item} onAction={onAction} />
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {category === "image" && canInline && (
            <div className="flex max-h-[55dvh] items-center justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inlineUrl} alt={file.fileName} className="max-h-[55dvh] w-auto max-w-full object-contain" onError={() => setMediaError(true)} />
            </div>
          )}
          {category === "video" && canInline && (
            <video src={inlineUrl} controls playsInline preload="metadata" className="max-h-[55dvh] w-full rounded-xl bg-black" onError={() => setMediaError(true)} />
          )}
          {category === "audio" && canInline && <audio src={inlineUrl} controls preload="metadata" className="w-full" onError={() => setMediaError(true)} />}
          {((category !== "image" && category !== "video" && category !== "audio") || !canInline) && (
            <div className="flex flex-col items-center justify-center rounded-xl bg-muted/50 px-4 py-10 text-center">
              <FileIcon file={file} size="lg" />
              <div className="mt-3 max-w-full truncate text-sm font-medium">{file.fileName}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(file.fileSize) || "Unknown size"}</div>
              {!file.browserDownloadable && (
                <p className="mt-3 max-w-xs text-xs text-muted-foreground">
                  This file is larger than Telegram allows bots to serve directly ({Math.floor(session.limits.maxDownloadBytes / 1048576)} MB). Use{" "}
                  <span className="font-medium text-foreground">Send to me in Telegram</span> to receive it in chat.
                </p>
              )}
              {mediaError && file.browserDownloadable && <p className="mt-3 text-xs text-destructive">Preview could not be loaded.</p>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 py-4">
          {canDownload && (
            <Button className="w-full" disabled={!file.browserDownloadable || !!busy} onClick={() => onAction(category === "pdf" ? "open" : "download", item)}>
              {busy === "download" || busy === "open" ? <Loader2 className="animate-spin" /> : category === "pdf" ? <ExternalLink /> : <Download />}
              {category === "pdf" ? "Open" : "Download"}
            </Button>
          )}
          {canDownload && (
            <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => onAction("send", item)}>
              {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send to me
            </Button>
          )}
          <Button variant="ghost" className="col-span-2 w-full" onClick={() => onAction("copy-link", item)}>
            <Link2 /> Copy link
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
