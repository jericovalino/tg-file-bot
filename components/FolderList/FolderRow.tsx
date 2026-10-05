"use client";

import { ChevronRight } from "lucide-react";
import { FolderIcon } from "@/components/common/file-icon";
import { ItemMenu, type ItemAction } from "@/components/ContextMenu/ItemMenu";
import type { Item } from "@/components/FileManager/hooks";
import type { BreadcrumbDto, FolderDto } from "@/lib/types";
import { formatDate, userDisplayName } from "@/lib/utils/format";

interface Props {
  folder: FolderDto;
  path?: BreadcrumbDto[];
  onOpen: (folder: FolderDto) => void;
  onAction: (action: ItemAction, item: Item) => void;
}

export function FolderRow({ folder, path, onOpen, onAction }: Props) {
  const item: Item = { kind: "folder", data: folder };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(folder)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(folder)}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors active:bg-accent"
    >
      <FolderIcon />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-5">{folder.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {path ? path.map((p) => p.name).join(" / ") : [formatDate(folder.createdAt), userDisplayName(folder.createdBy)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <ItemMenu item={item} onAction={onAction} />
      <ChevronRight className="-ml-1 size-4 text-muted-foreground/50" />
    </div>
  );
}
