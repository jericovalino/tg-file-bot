import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { roleFromTelegramStatus } from "@/lib/permissions/policy";

describe("permissions", () => {
  it("maps telegram statuses to roles", () => {
    expect(roleFromTelegramStatus("creator")).toBe("owner");
    expect(roleFromTelegramStatus("administrator")).toBe("admin");
    expect(roleFromTelegramStatus("member")).toBe("member");
    expect(roleFromTelegramStatus("restricted", true)).toBe("restricted");
    expect(roleFromTelegramStatus("restricted", false)).toBeNull();
    expect(roleFromTelegramStatus("left")).toBeNull();
    expect(roleFromTelegramStatus("kicked")).toBeNull();
  });

  it("members can upload but not manage folders; admins can", () => {
    const member = { userId: "u1", role: "member" as const };
    const admin = { userId: "u2", role: "admin" as const };
    expect(can(member, "files.upload")).toBe(true);
    expect(can(member, "folders.create")).toBe(false);
    expect(can(member, "files.delete")).toBe(false);
    expect(can(admin, "folders.delete")).toBe(true);
    expect(can(admin, "files.move")).toBe(true);
  });

  it("members may rename/delete only their own files", () => {
    const member = { userId: "u1", role: "member" as const };
    expect(can(member, "files.delete", { createdBy: "u1" })).toBe(true);
    expect(can(member, "files.delete", { createdBy: "u2" })).toBe(false);
    expect(can(member, "files.rename", { createdBy: "u1" })).toBe(true);
    expect(can(member, "files.move", { createdBy: "u1" })).toBe(false);
  });

  it("restricted members are read-only", () => {
    const r = { userId: "u1", role: "restricted" as const };
    expect(can(r, "files.view")).toBe(true);
    expect(can(r, "files.upload")).toBe(false);
  });
});
