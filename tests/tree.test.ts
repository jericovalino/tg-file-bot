import { describe, expect, it } from "vitest";
import { buildPathIndex, buildTree } from "@/lib/services/folder-tree";

const rows = [
  { id: "a", name: "Events", parentId: null },
  { id: "b", name: "2026", parentId: "a" },
  { id: "c", name: "Photos", parentId: "b" },
  { id: "d", name: "Lessons", parentId: null },
];

describe("folder tree helpers", () => {
  it("builds a nested tree", () => {
    const tree = buildTree(rows);
    expect(tree.map((n) => n.name)).toEqual(["Events", "Lessons"]);
    expect(tree[0].children[0].children[0].name).toBe("Photos");
  });

  it("computes breadcrumb paths", () => {
    const pathOf = buildPathIndex(rows);
    expect(pathOf("c").map((p) => p.name)).toEqual(["Group Files", "Events", "2026", "Photos"]);
    expect(pathOf(null).map((p) => p.name)).toEqual(["Group Files"]);
  });
});
