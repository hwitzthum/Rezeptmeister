import type { NextConfig } from "next";

// SUPABASE_URL is required at runtime but not during `next build`
// (NEXT_PHASE=phase-production-build).  Throwing at module load breaks local
// dev builds and preview deployments that set env vars only at runtime.
// Instead: derive the hostname when present, fall back to a safe placeholder
// that allows the build to succeed; the runtime guard in env-check.ts will
// catch a missing URL in production before any request is served.
const supabaseHostname = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : "placeholder.supabase.co";

// React/Next.js in dev mode evaluates code via eval() (Fast Refresh, source-map
// reconstruction), which a CSP without 'unsafe-eval' blocks — surfacing as a
// console error on every page. Relax script-src ONLY in development; the
// production policy stays strict.
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [48, 96, 192, 300, 480],
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/sign/**",
      },
    ],
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
              // 'unsafe-eval' is added in development only (see isDev above).
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: https://${supabaseHostname}`,
              `connect-src 'self' https://${supabaseHostname}`,
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
