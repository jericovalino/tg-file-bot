import { describe, expect, it } from "vitest";
import { buildBotStartLink, buildMiniAppLink, encodeStartParam, parseStartParam } from "@/lib/telegram/links";

describe("start params", () => {
  it("round-trips chat/folder/file targets", () => {
    const folderId = "0b1a6c8e-6b3d-4a52-9d1e-3f7c2a1b9e44";
    expect(parseStartParam(encodeStartParam({ type: "chat", chatKey: "AbCdEfGh12345678" }))).toEqual({ type: "chat", chatKey: "AbCdEfGh12345678" });
    expect(parseStartParam(encodeStartParam({ type: "folder", folderId }))).toEqual({ type: "folder", folderId });
    expect(parseStartParam(encodeStartParam({ type: "file", fileId: folderId }))).toEqual({ type: "file", fileId: folderId });
  });

  it("rejects garbage", () => {
    expect(parseStartParam("folder_../../etc")).toBeNull();
    expect(parseStartParam("c_")).toBeNull();
    expect(parseStartParam("c_with-dash")).toBeNull();
    expect(parseStartParam("x".repeat(600))).toBeNull();
    expect(parseStartParam(undefined)).toBeNull();
  });

  it("builds direct links for main and named mini apps", () => {
    expect(buildMiniAppLink("my_bot", "c_abc")).toBe("https://t.me/my_bot?startapp=c_abc");
    expect(buildMiniAppLink("my_bot", "c_abc", "files")).toBe("https://t.me/my_bot/files?startapp=c_abc");
    expect(buildMiniAppLink("my_bot")).toBe("https://t.me/my_bot?startapp");
    expect(buildBotStartLink("my_bot", "up_123")).toBe("https://t.me/my_bot?start=up_123");
  });
});
