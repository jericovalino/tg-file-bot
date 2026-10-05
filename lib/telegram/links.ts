/**
 * Deep links for the Mini App.
 *
 *  - Group context is only available to Mini Apps launched from a *direct link*
 *    (t.me/<bot>?startapp=... or t.me/<bot>/<app>?startapp=...). Menu buttons and web_app keyboard
 *    buttons are private-chat only, so the bot posts a direct-link button into the group instead.
 *  - `startapp` accepts A-Z a-z 0-9 _ - and up to 512 characters.
 */

export type StartTarget = { type: "chat"; chatKey: string } | { type: "folder"; folderId: string } | { type: "file"; fileId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_KEY_RE = /^[A-Za-z0-9]{8,32}$/;

export function encodeStartParam(target: StartTarget): string {
  switch (target.type) {
    case "chat":
      return `c_${target.chatKey}`;
    case "folder":
      return `folder_${target.folderId}`;
    case "file":
      return `file_${target.fileId}`;
  }
}

export function parseStartParam(value: string | undefined | null): StartTarget | null {
  if (!value || value.length > 512) return null;
  if (value.startsWith("c_")) {
    const chatKey = value.slice(2);
    return CHAT_KEY_RE.test(chatKey) ? { type: "chat", chatKey } : null;
  }
  if (value.startsWith("folder_")) {
    const folderId = value.slice(7);
    return UUID_RE.test(folderId) ? { type: "folder", folderId: folderId.toLowerCase() } : null;
  }
  if (value.startsWith("file_")) {
    const fileId = value.slice(5);
    return UUID_RE.test(fileId) ? { type: "file", fileId: fileId.toLowerCase() } : null;
  }
  return null;
}

export function buildMiniAppLink(botUsername: string, startParam?: string, shortName?: string): string {
  const base = shortName ? `https://t.me/${botUsername}/${shortName}` : `https://t.me/${botUsername}`;
  if (!startParam) return shortName ? base : `${base}?startapp`;
  return `${base}?startapp=${encodeURIComponent(startParam)}`;
}

/** Link that opens the bot's private chat and triggers /start <payload>. Payload: 1-64 chars of A-Z a-z 0-9 _ -. */
export function buildBotStartLink(botUsername: string, payload: string): string {
  return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}
