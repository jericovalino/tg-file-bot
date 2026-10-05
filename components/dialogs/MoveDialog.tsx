"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/toast";
import { useFileMutations, useFolderMutations, useFolderTree, type Item } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";
import type { FolderTreeNodeDto } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  item: Item | null;
  onClose: () => void;
}

function collectIds(node: FolderTreeNodeDto, into: Set<string>) {
  into.add(node.id);
  node.children.forEach((c) => collectIds(c, into));
}

function findNode(nodes: FolderTreeNodeDto[], id: string): FolderTreeNodeDto | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

export function MoveDialog({ item, onClose }: Props) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85dvh] max-w-sm flex-col">{item && <MoveForm key={item.data.id} item={item} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function MoveForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const tree = useFolderTree(true);
  const folders = useFolderMutations();
  const files = useFileMutations();
  const toast = useToast();
  const currentParent = item.kind === "folder" ? item.data.parentId : item.data.folderId;
  const [selected, setSelected] = useState<string | null>(currentParent ?? null);
  // null = "not touched yet": top-level folders are expanded by default once the tree arrives.
  const [expandedState, setExpanded] = useState<Set<string> | null>(null);
  const expanded = useMemo(() => expandedState ?? new Set(tree.data?.map((n) => n.id) ?? []), [expandedState, tree.data]);
  const pending = folders.move.isPending || files.move.isPending;

  // A folder can't be moved into itself or its descendants.
  const disabledIds = useMemo(() => {
    const set = new Set<string>();
    if (item.kind === "folder" && tree.data) {
      const node = findNode(tree.data, item.data.id);
      if (node) collectIds(node, set);
    }
    return set;
  }, [item, tree.data]);

  const toggle = (id: string) =>
    setExpanded(() => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    try {
      if (item.kind === "folder") await folders.move.mutateAsync({ folderId: item.data.id, parentId: selected });
      else await files.move.mutateAsync({ fileId: item.data.id, folderId: selected });
      haptic("success");
      toast({ title: "Moved", variant: "success" });
      onClose();
    } catch (err) {
      haptic("error");
      toast({ title: "Could not move", description: (err as Error).message, variant: "error" });
    }
  };

  const renderNode = (node: FolderTreeNodeDto, depth: number) => {
    const disabled = disabledIds.has(node.id);
    const isSelected = selected === node.id;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={cn("flex items-center gap-1 rounded-lg pr-2", isSelected && "bg-accent", disabled && "opacity-40")}
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          <button type="button" className="flex size-8 shrink-0 items-center justify-center text-muted-foreground" onClick={() => hasChildren && toggle(node.id)} aria-label={isOpen ? "Collapse" : "Expand"}>
            {hasChildren ? isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : <span className="size-4" />}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSelected(node.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm"
          >
            {isSelected ? <FolderOpen className="size-4 shrink-0 text-primary" /> : <Folder className="size-4 shrink-0 text-primary" />}
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        {hasChildren && isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const unchanged = selected === (currentParent ?? null);
  const name = item.kind === "folder" ? item.data.name : item.data.fileName;

  return (
    <>
        <DialogHeader>
          <DialogTitle>Move “{name}”</DialogTitle>
          <DialogDescription>Select a destination folder</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
          <div className={cn("flex items-center gap-1 rounded-lg pr-2", selected === null && "bg-accent")}>
            <span className="size-8" />
            <button type="button" onClick={() => setSelected(null)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm">
              <HardDrive className="size-4 shrink-0 text-primary" />
              <span>Group Files</span>
            </button>
          </div>
          {tree.isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">Loading folders…</p>}
          {tree.data?.map((n) => renderNode(n, 1))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={unchanged || pending} onClick={confirm}>
            {pending ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
    </>
  );
}
