"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/toast";
import { useFileMutations, useFolderMutations, type Item } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";

interface Props {
  item: Item | null;
  onClose: () => void;
}

export function RenameDialog({ item, onClose }: Props) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">{item && <RenameForm key={item.data.id} item={item} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RenameForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const current = item.kind === "folder" ? item.data.name : item.data.fileName;
  const [name, setName] = useState(current);
  const folders = useFolderMutations();
  const files = useFileMutations();
  const toast = useToast();
  const pending = folders.rename.isPending || files.rename.isPending;
  const selectedOnce = useRef(false);

  // Select the base name (without extension) on first focus.
  const inputRef = (el: HTMLInputElement | null) => {
    if (!el || selectedOnce.current) return;
    selectedOnce.current = true;
    requestAnimationFrame(() => {
      el.focus();
      const dot = item.kind === "file" ? current.lastIndexOf(".") : -1;
      el.setSelectionRange(0, dot > 0 ? dot : current.length);
    });
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (item.kind === "folder") await folders.rename.mutateAsync({ folderId: item.data.id, name: trimmed });
      else await files.rename.mutateAsync({ fileId: item.data.id, fileName: trimmed });
      haptic("success");
      onClose();
    } catch (err) {
      haptic("error");
      toast({ title: "Could not rename", description: (err as Error).message, variant: "error" });
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Rename {item.kind === "folder" ? "folder" : "file"}</DialogTitle>
      </DialogHeader>
      <div className="py-4">
        <Input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={item.kind === "folder" ? 120 : 255} enterKeyHint="done" />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
