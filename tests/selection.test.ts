import { describe, expect, it } from "vitest";
import { bulkCapabilities } from "@/components/FileManager/selection";
import { describeItems, itemName } from "@/components/dialogs/item-labels";
import type { Item } from "@/components/FileManager/hooks";
import type { FileDto, FolderDto, Permission } from "@/lib/types";

const me = { id: "u1", firstName: "Me", lastName: null, username: null };
const other = { id: "u2", firstName: "Other", lastName: null, username: null };

function file(id: string, createdBy = me): Item {
  return { kind: "file", data: { id, fileName: `${id}.txt`, createdBy } as FileDto };
}
function folder(id: string): Item {
  return { kind: "folder", data: { id, name: id, createdBy: me } as FolderDto };
}

/** Mirrors SessionProvider.can: direct permission, or the `.own` variant when the resource is the user's. */
function canFor(perms: Permission[]) {
  return (permission: Permission, resource?: { createdBy: { id: string } | null }) =>
    perms.includes(permission) || (!!resource?.createdBy && resource.createdBy.id === me.id && perms.includes(`${permission}.own` as Permission));
}

const memberCan = canFor(["files.view", "files.download", "files.upload", "files.rename.own", "files.delete.own"]);
const adminCan = canFor(["files.view", "files.download", "files.move", "files.delete", "folders.move", "folders.delete"]);

describe("bulkCapabilities", () => {
  it("offers nothing for an empty selection", () => {
    expect(bulkCapabilities([], adminCan)).toEqual({ move: false, delete: false, send: false });
  });

  it("members may delete only their own files and never folders", () => {
    expect(bulkCapabilities([file("a"), file("b")], memberCan).delete).toBe(true);
    expect(bulkCapabilities([file("a"), file("b", other)], memberCan).delete).toBe(false);
    expect(bulkCapabilities([file("a"), folder("f")], memberCan).delete).toBe(false);
    expect(bulkCapabilities([file("a")], memberCan).move).toBe(false);
  });

  it("admins can move and delete mixed selections", () => {
    const caps = bulkCapabilities([file("a", other), folder("f")], adminCan);
    expect(caps).toEqual({ move: true, delete: true, send: false });
  });

  it("send applies to file-only selections for anyone who can download", () => {
    expect(bulkCapabilities([file("a", other)], memberCan).send).toBe(true);
    expect(bulkCapabilities([file("a"), folder("f")], memberCan).send).toBe(false);
    expect(bulkCapabilities([file("a")], canFor(["files.view"])).send).toBe(false);
  });
});

describe("item labels", () => {
  it("names files and folders", () => {
    expect(itemName(file("report"))).toBe("report.txt");
    expect(itemName(folder("Docs"))).toBe("Docs");
  });

  it("describes a selection with correct plurals", () => {
    expect(describeItems([file("a")])).toBe("1 file");
    expect(describeItems([folder("x"), folder("y"), file("a")])).toBe("2 folders and 1 file");
    expect(describeItems([file("a")], { removedFiles: 5, removedFolders: 0 })).toBe("5 files");
  });
});
