import { describe, expect, it } from "vitest";
import { extractMedia } from "@/lib/telegram/media";
import type { TgMessage } from "@/lib/telegram/types";

const base: TgMessage = { message_id: 1, date: 1_700_000_000, chat: { id: 1, type: "private" } };

describe("extractMedia", () => {
  it("reads documents with thumbnails", () => {
    const m = extractMedia({ ...base, document: { file_id: "f", file_unique_id: "u", file_name: "a.pdf", mime_type: "application/pdf", file_size: 10, thumbnail: { file_id: "t", file_unique_id: "tu", width: 1, height: 1 } } });
    expect(m).toMatchObject({ kind: "document", fileName: "a.pdf", thumbnailFileId: "t", fileSize: 10 });
  });
  it("picks the largest photo size and a smaller thumbnail", () => {
    const m = extractMedia({
      ...base,
      photo: [
        { file_id: "s", file_unique_id: "su", width: 90, height: 90 },
        { file_id: "m", file_unique_id: "mu", width: 320, height: 320 },
        { file_id: "l", file_unique_id: "lu", width: 1280, height: 1280, file_size: 500 },
      ],
    });
    expect(m).toMatchObject({ kind: "photo", fileId: "l", fileUniqueId: "lu", thumbnailFileId: "m", mimeType: "image/jpeg" });
    expect(m?.fileName).toMatch(/^photo_.*\.jpg$/);
  });
  it("returns null for text messages", () => {
    expect(extractMedia({ ...base, text: "hi" })).toBeNull();
  });
});
