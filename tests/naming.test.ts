import { describe, expect, it } from "vitest";
import { dedupeName, folderNameSchema, sanitizeFileName } from "@/lib/services/naming";

describe("naming", () => {
  it("sanitises path traversal and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\win.ini")).toBe("win.ini");
    expect(sanitizeFileName("rep\u0000ort\n.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("   ")).toBe("file");
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(200);
  });

  it("validates folder names", () => {
    expect(folderNameSchema.parse("  Events ")).toBe("Events");
    expect(() => folderNameSchema.parse("a/b")).toThrow();
    expect(() => folderNameSchema.parse("..")).toThrow();
    expect(() => folderNameSchema.parse("")).toThrow();
  });

  it("dedupes names with a numeric suffix", async () => {
    const existing = new Set(["report.pdf", "report (2).pdf"]);
    expect(await dedupeName("report.pdf", async (c) => existing.has(c))).toBe("report (3).pdf");
    expect(await dedupeName("fresh.pdf", async (c) => existing.has(c))).toBe("fresh.pdf");
    expect(await dedupeName("README", async (c) => c === "README")).toBe("README (2)");
  });
});
