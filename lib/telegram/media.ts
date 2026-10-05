import type { ExtractedMedia, TgMessage } from "./types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(date: number) {
  const d = new Date(date * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
}

/** Pick the largest photo size (the one to download) and a small size suitable as a thumbnail. */
export function pickPhotoSizes(sizes: { file_id: string; width: number; height: number; file_size?: number }[]) {
  const sorted = [...sizes].sort((a, b) => a.width * a.height - b.width * b.height);
  const full = sorted[sorted.length - 1];
  const thumb = sorted.find((s) => Math.max(s.width, s.height) >= 300) ?? sorted[Math.min(1, sorted.length - 1)] ?? full;
  return { full, thumb };
}

/** Normalises any media attached to a Telegram message into a single description. */
export function extractMedia(message: TgMessage): ExtractedMedia | null {
  if (message.document) {
    const d = message.document;
    return {
      kind: "document",
      fileId: d.file_id,
      fileUniqueId: d.file_unique_id,
      fileName: d.file_name ?? `file_${stamp(message.date)}`,
      mimeType: d.mime_type,
      fileSize: d.file_size,
      thumbnailFileId: d.thumbnail?.file_id,
    };
  }
  if (message.video) {
    const v = message.video;
    return {
      kind: "video",
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      fileName: v.file_name ?? `video_${stamp(message.date)}.mp4`,
      mimeType: v.mime_type ?? "video/mp4",
      fileSize: v.file_size,
      width: v.width,
      height: v.height,
      duration: v.duration,
      thumbnailFileId: v.thumbnail?.file_id,
    };
  }
  if (message.animation) {
    const a = message.animation;
    return {
      kind: "animation",
      fileId: a.file_id,
      fileUniqueId: a.file_unique_id,
      fileName: a.file_name ?? `animation_${stamp(message.date)}.mp4`,
      mimeType: a.mime_type ?? "video/mp4",
      fileSize: a.file_size,
      width: a.width,
      height: a.height,
      duration: a.duration,
      thumbnailFileId: a.thumbnail?.file_id,
    };
  }
  if (message.audio) {
    const a = message.audio;
    const base = a.file_name ?? ([a.performer, a.title].filter(Boolean).join(" - ") || `audio_${stamp(message.date)}`);
    return {
      kind: "audio",
      fileId: a.file_id,
      fileUniqueId: a.file_unique_id,
      fileName: /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.mp3`,
      mimeType: a.mime_type ?? "audio/mpeg",
      fileSize: a.file_size,
      duration: a.duration,
      thumbnailFileId: a.thumbnail?.file_id,
    };
  }
  if (message.photo && message.photo.length > 0) {
    const { full, thumb } = pickPhotoSizes(message.photo);
    return {
      kind: "photo",
      fileId: full.file_id,
      fileUniqueId: message.photo.find((p) => p.file_id === full.file_id)?.file_unique_id ?? full.file_id,
      fileName: `photo_${stamp(message.date)}.jpg`,
      mimeType: "image/jpeg",
      fileSize: full.file_size,
      width: full.width,
      height: full.height,
      thumbnailFileId: thumb.file_id !== full.file_id ? thumb.file_id : undefined,
    };
  }
  if (message.voice) {
    const v = message.voice;
    return {
      kind: "voice",
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      fileName: `voice_${stamp(message.date)}.ogg`,
      mimeType: v.mime_type ?? "audio/ogg",
      fileSize: v.file_size,
      duration: v.duration,
    };
  }
  if (message.video_note) {
    const v = message.video_note;
    return {
      kind: "video_note",
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      fileName: `video_note_${stamp(message.date)}.mp4`,
      mimeType: "video/mp4",
      fileSize: v.file_size,
      width: v.length,
      height: v.length,
      duration: v.duration,
      thumbnailFileId: v.thumbnail?.file_id,
    };
  }
  return null;
}
