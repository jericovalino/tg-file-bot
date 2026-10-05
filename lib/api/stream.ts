import "@/lib/server-guard";
import { telegram } from "@/lib/telegram/bot-api";

const INLINE_SAFE = [/^image\/(png|jpe?g|gif|webp|avif|bmp)$/i, /^video\//i, /^audio\//i, /^application\/pdf$/i];

/** Types that may be rendered inline by the browser. Everything else (HTML, SVG, XML...) is forced to download to avoid XSS. */
export function canRenderInline(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return INLINE_SAFE.some((re) => re.test(mimeType));
}

export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Proxies a Telegram file to the client without ever revealing the bot token. Supports Range requests
 * (video seeking) by forwarding the header to Telegram.
 */
export async function streamTelegramFile(
  req: Request,
  filePath: string,
  opts: { fileName: string; mimeType: string | null; disposition: "inline" | "attachment"; size: number | null; cacheSeconds?: number },
): Promise<Response> {
  const range = req.headers.get("range") ?? undefined;
  const upstream = await telegram().fetchFile(filePath, range);
  const headers = new Headers();
  const inline = opts.disposition === "inline" && canRenderInline(opts.mimeType);
  headers.set("content-type", inline ? opts.mimeType! : "application/octet-stream");
  headers.set("content-disposition", contentDisposition(inline ? "inline" : "attachment", opts.fileName));
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("cache-control", opts.cacheSeconds ? `private, max-age=${opts.cacheSeconds}` : "private, no-store");
  headers.set("accept-ranges", "bytes");
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-length") && opts.size && upstream.status === 200) headers.set("content-length", String(opts.size));
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
