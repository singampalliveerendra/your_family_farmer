import type { NextConfig } from "next";

// Security headers applied to every response. These are cheap, app-wide
// defences — they don't replace per-route auth or RLS.
const securityHeaders = [
  // Force HTTPS for 2 years, including subdomains. Vercel already serves
  // HTTPS; this stops a downgrade attack on returning visitors.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // We never want our pages framed — blocks clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers MIME-sniffing a response into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can carry order ids) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful browser APIs we don't use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  // NOTE: When Razorpay checkout is wired up, add a Content-Security-Policy
  // here. It must allowlist Razorpay + Supabase, e.g.:
  //   script-src 'self' https://checkout.razorpay.com;
  //   frame-src  https://api.razorpay.com https://*.razorpay.com;
  //   connect-src 'self' https://*.supabase.co https://*.razorpay.com https://api.razorpay.com;
  // Adding a CSP before payments are integrated risks breaking checkout, so
  // it is intentionally deferred until that work lands.
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
