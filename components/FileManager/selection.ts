"use client";

import { useCallback, useMemo, useState } from "react";
import type { Permission } from "@/lib/types";
import type { Item } from "./hooks";

export type Selection = Map<string, Item>;

/**
 * Multi-select state for the browser and search views. Items are stored by id so the bulk bar can check
 * permissions and the dialogs can show names without re-reading the listing.
 */
export function useSelection() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Selection>(() => new Map());

  const start = useCallback((item?: Item) => {
    setActive(true);
    if (item) setSelected(new Map([[item.data.id, item]]));
  }, []);

  const toggle = useCallback((item: Item) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.data.id)) next.delete(item.data.id);
      else next.set(item.data.id, item);
      return next;
    });
  }, []);

  /** Selects every item in `items`, or clears the selection when all of them are already selected. */
  const toggleAll = useCallback((items: Item[]) => {
    setSelected((prev) => {
      const all = items.length > 0 && items.every((i) => prev.has(i.data.id));
      return all ? new Map() : new Map(items.map((i) => [i.data.id, i]));
    });
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Map());
  }, []);

  /** Drops ids that are no longer selectable (e.g. after a delete). */
  const remove = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const items = useMemo(() => [...selected.values()], [selected]);
  return { active, selected, items, start, toggle, toggleAll, exit, remove };
}

type Can = (permission: Permission, resource?: { createdBy: { id: string } | null }) => boolean;

/** Which bulk actions apply to the whole selection. The server re-checks each item. */
export function bulkCapabilities(items: Item[], can: Can) {
  const files = items.filter((i) => i.kind === "file");
  const folders = items.filter((i) => i.kind === "folder");
  const nonEmpty = items.length > 0;
  return {
    move: nonEmpty && (files.length === 0 || can("files.move")) && (folders.length === 0 || can("folders.move")),
    delete:
      nonEmpty &&
      files.every((f) => can("files.delete", { createdBy: f.data.createdBy })) &&
      (folders.length === 0 || can("folders.delete")),
    send: nonEmpty && folders.length === 0 && can("files.download"),
  };
}
