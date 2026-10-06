"use client";

import { ChevronRight } from "lucide-react";
import { FolderIcon } from "@/components/common/file-icon";
import { SelectionCheck } from "@/components/common/selection-check";
import { useLongPress } from "@/components/common/use-long-press";
import { ItemMenu, type ItemAction } from "@/components/ContextMenu/ItemMenu";
import type { Item } from "@/components/FileManager/hooks";
import type { BreadcrumbDto, FolderDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate, userDisplayName } from "@/lib/utils/format";

interface Props {
  folder: FolderDto;
  path?: BreadcrumbDto[];
  onOpen: (folder: FolderDto) => void;
  onAction: (action: ItemAction, item: Item) => void;
  /** Selection mode: tapping toggles instead of navigating and the ⋮ menu is hidden. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (item: Item) => void;
  /** Long press enters selection mode with this item selected. */
  onLongPress?: (item: Item) => void;
}

export function FolderRow({ folder, path, onOpen, onAction, selecting, selected, onToggleSelect, onLongPress }: Props) {
  const item: Item = { kind: "folder", data: folder };
  const longPress = useLongPress(onLongPress && !selecting ? () => onLongPress(item) : undefined);
  const activate = () => (selecting ? onToggleSelect?.(item) : onOpen(folder));
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? !!selected : undefined}
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => (e.key === "Enter" || (selecting && e.key === " ")) && activate()}
      {...longPress}
      className={cn(
        "flex w-full select-none items-center gap-3 px-3 py-2 text-left transition-colors active:bg-accent [-webkit-touch-callout:none]",
        selected && "bg-accent",
      )}
    >
      {selecting && <SelectionCheck checked={!!selected} />}
      <FolderIcon />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-5">{folder.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {path ? path.map((p) => p.name).join(" / ") : [formatDate(folder.createdAt), userDisplayName(folder.createdBy)].filter(Boolean).join(" · ")}
        </div>
      </div>
      {selecting ? null : (
        <>
          <ItemMenu item={item} onAction={onAction} />
          <ChevronRight className="-ml-1 size-4 text-muted-foreground/50" />
        </>
      )}
    </div>
  );
}
