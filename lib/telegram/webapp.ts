/**
 * Client-side access to the Telegram Mini App SDK (window.Telegram.WebApp), loaded from
 * https://telegram.org/js/telegram-web-app.js in the root layout. Only the subset used by this app is typed.
 */

export interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  section_separator_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export interface TgBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; chat_type?: string; chat_instance?: string; user?: { id: number; first_name: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  BackButton: TgBackButton;
  HapticFeedback: TgHapticFeedback;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: "bg_color" | "secondary_bg_color" | `#${string}`): void;
  setBackgroundColor(color: "bg_color" | "secondary_bg_color" | `#${string}`): void;
  setBottomBarColor?(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  downloadFile?(params: { url: string; file_name: string }, callback?: (accepted: boolean) => void): void;
  showPopup?(params: { title?: string; message: string; buttons?: { id?: string; type?: string; text?: string }[] }, cb?: (id: string) => void): void;
  showAlert?(message: string, cb?: () => void): void;
  onEvent(event: string, handler: (...args: unknown[]) => void): void;
  offEvent(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isInsideTelegram(): boolean {
  const wa = getWebApp();
  return !!wa && !!wa.initData;
}

export function haptic(kind: "light" | "medium" | "success" | "error" | "selection" = "light") {
  const wa = getWebApp();
  if (!wa?.HapticFeedback) return;
  try {
    if (kind === "success" || kind === "error") wa.HapticFeedback.notificationOccurred(kind);
    else if (kind === "selection") wa.HapticFeedback.selectionChanged();
    else wa.HapticFeedback.impactOccurred(kind);
  } catch {
    /* older clients */
  }
}

/** Mirrors Telegram's colour scheme onto the <html> element so Tailwind's `dark:` variants follow the client theme. */
export function applyTelegramTheme() {
  const wa = getWebApp();
  if (!wa) return;
  const root = document.documentElement;
  root.classList.toggle("dark", wa.colorScheme === "dark");
  root.style.colorScheme = wa.colorScheme;
  try {
    wa.setHeaderColor("secondary_bg_color");
    wa.setBackgroundColor("secondary_bg_color");
    wa.setBottomBarColor?.("secondary_bg_color");
  } catch {
    /* unsupported version */
  }
}

/** Opens a URL in the external browser (or Telegram's in-app browser). */
export function openExternal(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export function openTelegramLink(url: string) {
  const wa = getWebApp();
  if (wa) wa.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Bot API 8.0+ native download prompt; falls back to opening the URL. */
export function downloadViaTelegram(url: string, fileName: string): Promise<boolean> {
  const wa = getWebApp();
  return new Promise((resolve) => {
    if (wa?.downloadFile && wa.isVersionAtLeast("8.0")) {
      try {
        wa.downloadFile({ url, file_name: fileName }, (accepted) => resolve(accepted));
        return;
      } catch {
        /* fall through */
      }
    }
    openExternal(url);
    resolve(true);
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
