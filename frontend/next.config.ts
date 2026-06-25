import type { NextConfig } from "next";

// Supabase Storage is the prod image backend; dev falls back to the local
// filesystem (served same-origin via /api/uploads). Require the URL only in
// production so dev can boot without Supabase credentials.
if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
const supabaseHostname = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [48, 96, 192, 300, 480],
    // Local-dev images are same-origin (/api/uploads); only Supabase needs a remote pattern.
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js App Router requires 'unsafe-inline' for inline hydration scripts.
              // Nonce-based CSP (strict-dynamic) would eliminate this but requires
              // per-request nonce injection via middleware. Track in security backlog.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob:${supabaseHostname ? ` https://${supabaseHostname}` : ""}`,
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              // Explicitly block object/embed elements (Flash, plugins)
              "object-src 'none'",
              // Block worker scripts from external origins
              "worker-src 'self' blob:",
              // Block loading manifests from external origins
              "manifest-src 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
