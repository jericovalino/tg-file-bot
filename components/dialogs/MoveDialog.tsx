"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/toast";
import { useBulkMutations, useFolderTree, type Item } from "@/components/FileManager/hooks";
import { haptic } from "@/lib/telegram/webapp";
import type { FolderTreeNodeDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeItems, itemName } from "./item-labels";

interface Props {
  /** Items to move; an empty list keeps the dialog closed. */
  items: Item[];
  onClose: () => void;
  onMoved?: (items: Item[]) => void;
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

function parentOf(item: Item): string | null {
  return (item.kind === "folder" ? item.data.parentId : item.data.folderId) ?? null;
}

export function MoveDialog({ items, onClose, onMoved }: Props) {
  const open = items.length > 0;
  const key = items.map((i) => i.data.id).join(",");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85dvh] max-w-sm flex-col">{open && <MoveForm key={key} items={items} onClose={onClose} onMoved={onMoved} />}</DialogContent>
    </Dialog>
  );
}

function MoveForm({ items, onClose, onMoved }: { items: Item[]; onClose: () => void; onMoved?: (items: Item[]) => void }) {
  const tree = useFolderTree(true);
  const bulk = useBulkMutations();
  const toast = useToast();
  // When every item shares a parent, that parent is preselected and "Move here" stays disabled until it changes.
  const commonParent = useMemo(() => {
    const parents = new Set(items.map(parentOf));
    return parents.size === 1 ? [...parents][0] : undefined;
  }, [items]);
  const [selected, setSelected] = useState<string | null>(commonParent ?? null);
  // null = "not touched yet": top-level folders are expanded by default once the tree arrives.
  const [expandedState, setExpanded] = useState<Set<string> | null>(null);
  const expanded = useMemo(() => expandedState ?? new Set(tree.data?.map((n) => n.id) ?? []), [expandedState, tree.data]);
  const pending = bulk.move.isPending;

  // A folder can't be moved into itself or its descendants.
  const disabledIds = useMemo(() => {
    const set = new Set<string>();
    if (!tree.data) return set;
    for (const item of items) {
      if (item.kind !== "folder") continue;
      const node = findNode(tree.data, item.data.id);
      if (node) collectIds(node, set);
    }
    return set;
  }, [items, tree.data]);

  const toggle = (id: string) =>
    setExpanded(() => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    try {
      await bulk.move.mutateAsync({ items, destinationId: selected });
      haptic("success");
      toast({ title: items.length === 1 ? "Moved" : `Moved ${describeItems(items)}`, variant: "success" });
      onMoved?.(items);
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

  const unchanged = commonParent !== undefined && selected === commonParent;
  const title = items.length === 1 ? `Move “${itemName(items[0])}”` : `Move ${items.length} items`;

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{items.length === 1 ? "Select a destination folder" : `Select a destination folder for ${describeItems(items)}`}</DialogDescription>
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
