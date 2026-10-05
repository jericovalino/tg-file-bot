import { z } from "zod";

const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/** Folder names: trimmed, 1..120 chars, no path separators or control characters. */
export const folderNameSchema = z
  .string()
  .transform((s) => s.replace(CONTROL_CHARS, "").trim())
  .pipe(
    z
      .string()
      .min(1, "Name is required")
      .max(120, "Name is too long (max 120 characters)")
      .refine((s) => !/[\\/]/.test(s), "Name cannot contain / or \\")
      .refine((s) => s !== "." && s !== "..", "Invalid name"),
  );

/** Sanitises a user-supplied file name so it is safe to store and to echo back in Content-Disposition. */
export function sanitizeFileName(input: string | undefined | null, fallback = "file"): string {
  // Keep only the last path segment, then strip leading dots (no hidden files / traversal).
  const segments = (input ?? "").replace(CONTROL_CHARS, "").split(/[\\/]+/).filter((s) => s.trim().length > 0);
  let name = (segments[segments.length - 1] ?? "").trim();
  name = name.replace(/^\.+/, "").trim();
  if (!name) name = fallback;
  if (name.length > 200) {
    const ext = extensionOf(name);
    const base = name.slice(0, 200 - (ext ? ext.length + 1 : 0));
    name = ext ? `${base}.${ext}` : base;
  }
  return name;
}

export const fileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .transform((s) => sanitizeFileName(s))
  .refine((s) => s.length > 0, "Name is required");

export function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(fileName);
  return m ? m[1].toLowerCase() : "";
}

export function splitExtension(fileName: string): { base: string; ext: string } {
  const ext = extensionOf(fileName);
  return ext ? { base: fileName.slice(0, -(ext.length + 1)), ext } : { base: fileName, ext: "" };
}

/** Produces "name (2).ext", "name (3).ext", ... until `exists` says it's free. */
export async function dedupeName(name: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(name))) return name;
  const { base, ext } = splitExtension(name);
  const stripped = base.replace(/ \(\d+\)$/, "");
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stripped} (${i})${ext ? `.${ext}` : ""}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${stripped} (${Date.now()})${ext ? `.${ext}` : ""}`;
}

/** Postgres unique_violation (23505), also when wrapped by Drizzle's DrizzleQueryError (`cause`). */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 4 && typeof cur === "object" && cur !== null; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
