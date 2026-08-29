import type { NextConfig } from "next";

// Supabase Storage hosts that next/image is allowed to optimise.
//
// Production is hardcoded so a missing/incorrect build env can never silently
// break the live site. Every other environment adds its OWN project host,
// derived from the Supabase URL the build is already configured with.
//
// Why the env-derived entry exists: images are served straight out of each
// project's Storage, so a preview built against staging serves
// egaquepinrgzzyfazppr.supabase.co. With only the production host listed,
// next/image answered every one of those with 400 and the whole staging
// catalogue rendered as broken-image icons — the files were fine, the
// optimiser just refused the hostname. Deriving it means the next environment
// (or a rotated project ref) works without anyone remembering this file.
const PROD_SUPABASE_HOST = "bzwczufnlqwlirtrccwr.supabase.co";

function supabaseHostFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    // A malformed URL is the deploy's problem, not the build's — fall back to
    // the production host rather than failing the build outright.
    return null;
  }
}

const allowedSupabaseHosts = [
  ...new Set([PROD_SUPABASE_HOST, supabaseHostFromEnv()].filter(Boolean) as string[]),
];

// Security headers applied to every route.
//
// Kept deliberately boring: these four are safe on any page and cost nothing.
// Frame protection is DENY rather than SAMEORIGIN because the app renders no
// iframes of its own — Razorpay's checkout embeds ITS frame inside our page,
// which frame-src governs, not this header. Clickjacking a checkout flow is the
// attack this shuts out.
//
// Permissions-Policy allows geolocation on our own origin because three
// surfaces genuinely use it (the farmer dashboard's farm pin, the consumer
// "near me" filter, and the moderator farmer form). Camera and microphone are
// unused, so they are denied outright.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
  },
  // Vercel terminates TLS and already redirects to HTTPS; this stops a browser
  // that has seen the site once from ever trying plaintext again.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Content-Security-Policy, in REPORT-ONLY mode on purpose.
//
// A CSP that is wrong doesn't degrade — it silently blocks a script, and the
// script most likely to break here is Razorpay's checkout, i.e. the one path
// where breakage costs real money. Report-Only lets the browser tell us what
// WOULD have been blocked while everything keeps working.
//
// 'unsafe-inline'/'unsafe-eval' in script-src are placeholders: Next injects
// inline bootstrap and hydration scripts, so enforcing without them needs a
// nonce threaded through the document. That is the follow-up work; shipping
// this in report-only first is what tells us whether anything ELSE is lurking.
//
// TO ENFORCE: watch the reports for a week, tighten the directives that fire,
// then rename the header to "Content-Security-Policy". Do not enforce blind.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  // No fonts.googleapis.com / fonts.gstatic.com: the brand faces are committed
  // to the repo and served from our own origin (see src/app/layout.tsx).
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in the
  // home directory was making Next/Turbopack infer the wrong root.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Public storage objects only — never the signed/private paths.
    remotePatterns: allowedSupabaseHosts.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/storage/v1/object/public/**",
    })),
  },
  // The Android build, served as a plain static file out of public/. Path is
  // duplicated from src/lib/apkRelease.ts because next.config.ts cannot use
  // the `@/` alias — keep the two in step.
  //
  // Without the explicit type Vercel serves the .apk as octet-stream, which
  // some Android browsers hand to a file manager instead of the package
  // installer. must-revalidate matters just as much: a new build reuses this
  // filename, and a cached copy would keep handing out the old app forever.
  async headers() {
    return [
      {
        // Every route.
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
      {
        source: "/downloads/gogrameen.apk",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="GoGrameen.apk"',
          },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
