import type { NextConfig } from "next";

// In development the Mini App is reached through an HTTPS tunnel. Next.js blocks cross-origin requests to dev
// assets (including the HMR WebSocket) unless the tunnel hostname is allow-listed here.
function devOrigins(): string[] {
  const origins = ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io", "*.loca.lt"];
  try {
    if (process.env.NEXT_PUBLIC_APP_URL) origins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).hostname);
  } catch {
    /* invalid URL: env validation reports it at runtime */
  }
  return origins;
}

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker deployments.
  output: "standalone",
  allowedDevOrigins: devOrigins(),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // Allow embedding only inside Telegram's Mini App web views.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // React's dev tooling needs eval(); production builds never do.
              `script-src 'self' 'unsafe-inline' https://telegram.org${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob:",
              "connect-src 'self'",
              "font-src 'self' data:",
              "frame-ancestors https://web.telegram.org https://*.telegram.org",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
