import type { FileDto } from "@/lib/types";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type FileCategory = "image" | "video" | "audio" | "pdf" | "document" | "spreadsheet" | "presentation" | "archive" | "code" | "text" | "other";

const EXT_MAP: Record<string, FileCategory> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image", heif: "image", bmp: "image", svg: "image", avif: "image",
  mp4: "video", mov: "video", mkv: "video", webm: "video", avi: "video", m4v: "video",
  mp3: "audio", m4a: "audio", ogg: "audio", oga: "audio", wav: "audio", flac: "audio", aac: "audio",
  pdf: "pdf",
  doc: "document", docx: "document", odt: "document", rtf: "document", pages: "document",
  xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet", ods: "spreadsheet", numbers: "spreadsheet",
  ppt: "presentation", pptx: "presentation", odp: "presentation", key: "presentation",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", bz2: "archive",
  js: "code", ts: "code", tsx: "code", jsx: "code", py: "code", java: "code", go: "code", rs: "code", c: "code", cpp: "code", json: "code", html: "code", css: "code", sh: "code", yml: "code", yaml: "code", sql: "code",
  txt: "text", md: "text", log: "text",
};

export function fileCategory(file: Pick<FileDto, "fileName" | "mimeType" | "telegramKind">): FileCategory {
  const mime = file.mimeType ?? "";
  if (file.telegramKind === "photo" || mime.startsWith("image/")) return "image";
  if (file.telegramKind === "video" || file.telegramKind === "animation" || file.telegramKind === "video_note" || mime.startsWith("video/")) return "video";
  if (file.telegramKind === "audio" || file.telegramKind === "voice" || mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  const ext = /\.([a-z0-9]+)$/i.exec(file.fileName)?.[1]?.toLowerCase();
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
  if (mime.includes("word") || mime.includes("document")) return "document";
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar")) return "archive";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export function fileEmoji(category: FileCategory): string {
  switch (category) {
    case "image": return "🖼️";
    case "video": return "🎞️";
    case "audio": return "🎵";
    case "pdf": return "📕";
    case "document": return "📄";
    case "spreadsheet": return "📊";
    case "presentation": return "📑";
    case "archive": return "🗜️";
    case "code": return "👨‍💻";
    case "text": return "📝";
    default: return "📎";
  }
}

export function userDisplayName(u: { firstName: string; lastName: string | null; username: string | null } | null | undefined): string {
  if (!u) return "";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || (u.username ? `@${u.username}` : "");
}

export function truncateMiddle(s: string, max = 40): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
