"use client";

import { useState } from "react";
import { FileIcon } from "@/components/common/file-icon";
import { ItemMenu, type ItemAction } from "@/components/ContextMenu/ItemMenu";
import type { Item } from "@/components/FileManager/hooks";
import { mediaUrl } from "@/lib/api/client";
import type { BreadcrumbDto, FileDto } from "@/lib/types";
import { fileCategory, formatBytes, formatDate, formatDuration, userDisplayName } from "@/lib/utils/format";

interface Props {
  file: FileDto;
  mediaToken: string;
  path?: BreadcrumbDto[];
  highlighted?: boolean;
  onOpen: (file: FileDto) => void;
  onAction: (action: ItemAction, item: Item) => void;
}

export function FileRow({ file, mediaToken, path, highlighted, onOpen, onAction }: Props) {
  const item: Item = { kind: "file", data: file };
  const [thumbFailed, setThumbFailed] = useState(false);
  const category = fileCategory(file);
  const showThumb = file.hasThumbnail && !thumbFailed && (category === "image" || category === "video");
  const meta = [formatBytes(file.fileSize), file.duration ? formatDuration(file.duration) : "", formatDate(file.createdAt), userDisplayName(file.createdBy)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(file)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(file)}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors active:bg-accent ${highlighted ? "bg-accent" : ""}`}
    >
      {showThumb ? (
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(file.id, mediaToken, "thumbnail")} alt="" className="size-full object-cover" loading="lazy" onError={() => setThumbFailed(true)} />
        </div>
      ) : (
        <FileIcon file={file} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-5">{file.fileName}</div>
        <div className="truncate text-xs text-muted-foreground">{path ? path.map((p) => p.name).join(" / ") : meta}</div>
      </div>
      <ItemMenu item={item} onAction={onAction} />
    </div>
  );
}
