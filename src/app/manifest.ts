import type { MetadataRoute } from "next";

/* Makes Go Grameen installable — Chrome on Android turns this into a real
   entry in the app drawer, iOS Safari into a home-screen icon. No native app,
   no Play Store, no next-pwa: Next serves this at /manifest.webmanifest and
   injects the <link> itself.
 *
 * Deliberately NO service worker alongside this. Installability doesn't need
 * one, and almost every page here is live Supabase data (stock, order status)
 * plus Razorpay's script — a cache layer would show buyers sold-out harvests
 * and stale order states with no way to force a refresh. Offline support, if
 * it's ever wanted, is a separate decision. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity. Without an explicit id the install is keyed on
    // start_url, so changing the landing page later would orphan every icon
    // already on a farmer's phone and install a duplicate beside it.
    id: "/",
    name: "Go Grameen — Your Family Farmer",
    // Shown under the icon, so it has to survive the launcher's truncation.
    short_name: "Go Grameen",
    description:
      "Buy natural harvests directly from farmers in Andhra Pradesh. No middlemen.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The whole UI is built to a 390px viewport; letting a tablet launch it
    // sideways only exposes layouts nobody has looked at.
    orientation: "portrait",
    lang: "en",
    // Matches SplashScreen's green, so Android's launch screen hands over to
    // the app's own splash with no colour flash in between.
    background_color: "#1a5c2a",
    theme_color: "#1a5c2a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // "any" only — declaring these maskable would let Android crop the
        // artwork to its circle and clip the mark. Maskable versions need
        // re-drawn icons with safe-zone padding, not a manifest edit.
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
