import type { Item } from "@/components/FileManager/hooks";

export function itemName(item: Item): string {
  return item.kind === "folder" ? item.data.name : item.data.fileName;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * "2 folders and 3 files". When server totals are given (which include files nested in deleted folders),
 * the file count comes from them.
 */
export function describeItems(items: Item[], totals?: { removedFiles: number; removedFolders: number }): string {
  const folders = totals?.removedFolders ?? items.filter((i) => i.kind === "folder").length;
  const files = totals?.removedFiles ?? items.filter((i) => i.kind === "file").length;
  const parts = [folders > 0 ? plural(folders, "folder") : "", files > 0 ? plural(files, "file") : ""].filter(Boolean);
  return parts.join(" and ");
}
