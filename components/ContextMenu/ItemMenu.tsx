"use client";

import { Download, ExternalLink, FolderInput, Link2, MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { haptic } from "@/lib/telegram/webapp";
import type { Item } from "@/components/FileManager/hooks";
import { useSession } from "@/components/FileManager/session-context";

export type ItemAction = "open" | "download" | "send" | "rename" | "move" | "copy-link" | "delete";

interface Props {
  item: Item;
  onAction: (action: ItemAction, item: Item) => void;
}

/** The ⋮ menu for a file or folder. Items are filtered by the user's permissions; the server re-checks everything. */
export function ItemMenu({ item, onAction }: Props) {
  const { can } = useSession();
  const isFile = item.kind === "file";
  const owned = { createdBy: item.data.createdBy };

  const canRename = isFile ? can("files.rename", owned) : can("folders.rename");
  const canMove = isFile ? can("files.move", owned) : can("folders.move");
  const canDelete = isFile ? can("files.delete", owned) : can("folders.delete");
  const canDownload = isFile && can("files.download");

  const fire = (action: ItemAction) => {
    haptic("light");
    onAction(action, item);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions" className="text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => fire("open")}>
          <ExternalLink /> Open
        </DropdownMenuItem>
        {canDownload && (
          <>
            <DropdownMenuItem onSelect={() => fire("download")}>
              <Download /> Download
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fire("send")}>
              <Send /> Send to me in Telegram
            </DropdownMenuItem>
          </>
        )}
        {(canRename || canMove) && <DropdownMenuSeparator />}
        {canRename && (
          <DropdownMenuItem onSelect={() => fire("rename")}>
            <Pencil /> Rename
          </DropdownMenuItem>
        )}
        {canMove && (
          <DropdownMenuItem onSelect={() => fire("move")}>
            <FolderInput /> Move
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => fire("copy-link")}>
          <Link2 /> Copy link
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => fire("delete")}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
