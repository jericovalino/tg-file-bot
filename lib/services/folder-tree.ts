/** Pure helpers for folder trees and breadcrumb paths (no DB access, unit-testable). */
import type { BreadcrumbDto, FolderTreeNodeDto } from "@/lib/types";

export const ROOT_NAME = "Group Files";
const MAX_DEPTH = 64;

export function buildTree(rows: { id: string; name: string; parentId: string | null }[]): FolderTreeNodeDto[] {
  const nodes = new Map<string, FolderTreeNodeDto>();
  for (const r of rows) nodes.set(r.id, { id: r.id, name: r.name, parentId: r.parentId, children: [] });
  const roots: FolderTreeNodeDto[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Builds a map folderId → breadcrumb path (root first) from all folders of a chat, for search results. */
export function buildPathIndex(rows: { id: string; name: string; parentId: string | null }[]): (folderId: string | null) => BreadcrumbDto[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cache = new Map<string, BreadcrumbDto[]>();
  return (folderId) => {
    const root: BreadcrumbDto = { id: null, name: ROOT_NAME };
    if (!folderId) return [root];
    if (cache.has(folderId)) return cache.get(folderId)!;
    const chain: BreadcrumbDto[] = [];
    let cur = byId.get(folderId);
    let guard = 0;
    while (cur && guard++ < MAX_DEPTH) {
      chain.unshift({ id: cur.id, name: cur.name });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const path = [root, ...chain];
    cache.set(folderId, path);
    return path;
  };
}
