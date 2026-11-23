import type { NextConfig } from "next";

const esDev = process.env.NODE_ENV === "development";

const HOSTS_IMAGEN = [
  "https://wow.zamimg.com",
  "https://render.worldofwarcraft.com",
  "https://worldofwarcraft.blizzard.com",
  "https://nether.wowhead.com",
  "https://cdn.discordapp.com",
  "https://static.icy-veins.com",
];

const IMG_SRC = ["'self'", "blob:", "data:", ...HOSTS_IMAGEN].join(" ");

const SCRIPT_SRC = [
  "'self'",
  "'unsafe-inline'",
  "https://wow.zamimg.com",
  esDev ? "'unsafe-eval'" : "",
]
  .filter(Boolean)
  .join(" ");

const CONNECT_SRC = [
  "'self'",
  "https://nether.wowhead.com",
  "https://wow.zamimg.com",
  esDev ? "ws: wss:" : "",
]
  .filter(Boolean)
  .join(" ");

const CSP = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC}`,
  "style-src 'self' 'unsafe-inline' https://wow.zamimg.com",
  `img-src ${IMG_SRC}`,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
