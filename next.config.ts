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
};

export default nextConfig;
