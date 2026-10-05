"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/toast";
import { useFolderMutations } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";

interface Props {
  open: boolean;
  parentId: string | null;
  parentName: string;
  onOpenChange: (open: boolean) => void;
}

export function CreateFolderDialog({ open, parentId, parentName, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const { create } = useFolderMutations();
  const toast = useToast();

  const handleOpenChange = (o: boolean) => {
    if (!o) setName("");
    onOpenChange(o);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ parentId, name: trimmed });
      haptic("success");
      handleOpenChange(false);
    } catch (err) {
      haptic("error");
      toast({ title: "Could not create folder", description: (err as Error).message, variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Inside {parentName}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" maxLength={120} enterKeyHint="done" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
