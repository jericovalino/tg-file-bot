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
import { useFileMutations, useFolderMutations, type Item } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";

interface Props {
  item: Item | null;
  onClose: () => void;
  onDeleted?: (item: Item) => void;
}

export function DeleteDialog({ item, onClose, onDeleted }: Props) {
  const folders = useFolderMutations();
  const files = useFileMutations();
  const toast = useToast();
  const pending = folders.remove.isPending || files.remove.isPending;

  const confirm = async () => {
    if (!item) return;
    try {
      if (item.kind === "folder") await folders.remove.mutateAsync(item.data.id);
      else await files.remove.mutateAsync(item.data.id);
      haptic("success");
      toast({ title: item.kind === "folder" ? "Folder deleted" : "File deleted", variant: "success" });
      onDeleted?.(item);
      onClose();
    } catch (err) {
      haptic("error");
      toast({ title: "Could not delete", description: (err as Error).message, variant: "error" });
    }
  };

  const name = item ? (item.kind === "folder" ? item.data.name : item.data.fileName) : "";
  return (
    <AlertDialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {item?.kind === "folder"
              ? "The folder and everything inside it will be removed from the file manager. This cannot be undone."
              : "The file will be removed from the file manager. This cannot be undone."}
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
