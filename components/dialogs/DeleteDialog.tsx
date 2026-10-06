"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/common/toast";
import { useBulkMutations, type Item } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";
import { describeItems, itemName } from "./item-labels";

interface Props {
  /** Items to delete; an empty list keeps the dialog closed. */
  items: Item[];
  onClose: () => void;
  onDeleted?: (items: Item[]) => void;
}

export function DeleteDialog({ items, onClose, onDeleted }: Props) {
  const bulk = useBulkMutations();
  const toast = useToast();
  const pending = bulk.remove.isPending;
  const open = items.length > 0;
  const single = items.length === 1 ? items[0] : null;

  const confirm = async () => {
    if (!open) return;
    try {
      const result = await bulk.remove.mutateAsync(items);
      haptic("success");
      toast({
        title: single ? (single.kind === "folder" ? "Folder deleted" : "File deleted") : `${items.length} items deleted`,
        description: single ? undefined : describeItems(items, { removedFiles: result.removedFiles, removedFolders: result.removedFolders }),
        variant: "success",
      });
      onDeleted?.(items);
      onClose();
    } catch (err) {
      haptic("error");
      toast({ title: "Could not delete", description: (err as Error).message, variant: "error" });
    }
  };

  const hasFolder = items.some((i) => i.kind === "folder");
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{single ? `Delete “${itemName(single)}”?` : `Delete ${items.length} items?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {single
              ? single.kind === "folder"
                ? "The folder and everything inside it will be removed from the file manager. This cannot be undone."
                : "The file will be removed from the file manager. This cannot be undone."
              : `${describeItems(items)} will be removed from the file manager${hasFolder ? ", including everything inside the folders" : ""}. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
