import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import { ConsumerAuthProvider } from "@/lib/ConsumerAuthContext";
import SplashScreen from "@/components/SplashScreen";
import StagingBanner from "@/components/StagingBanner";
import InstallCounter from "@/components/InstallCounter";

/* Brand type. Fraunces carries the Latin wordmark (soft, slightly wonky serif
   — the farm-to-table look); it has no Telugu glyphs, so Noto Serif Telugu
   sits next to it in the same stack and the browser falls back per glyph when
   the UI is in Telugu. Only the logo lockup uses them — body copy stays on the
   system stack.

   The .woff2 files are committed under ./fonts and loaded with next/font/local
   rather than next/font/google. next/font/google also self-hosts the files it
   serves, so this changes nothing for the user on 4G — what it removes is the
   BUILD-time fetch of fonts.googleapis.com. That fetch is a hard dependency:
   with Google unreachable (an offline CI runner, a locked-down network) the
   build fails outright rather than degrading, which is a poor reason to be
   unable to ship.

   Both files are the Google-hosted variable originals, subset exactly as the
   old config asked for (Fraunces latin, Noto Serif Telugu telugu). Fraunces
   keeps all four axes — opsz, wght, SOFT and WONK — which globals.css depends
   on: `font-variation-settings: "SOFT" 40, "WONK" 1, "opsz" 60`. If you ever
   re-download these, verify the axes survived or the wordmark quietly loses
   its shape. */
const fraunces = localFont({
  src: "./fonts/Fraunces-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-brand",
  fallback: ["Georgia", "serif"],
});

const notoSerifTelugu = localFont({
  src: "./fonts/NotoSerifTelugu-telugu-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-brand-te",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  title: "Go Grameen — Your Family Farmer",
  description: "Buy natural harvests directly from farmers in Andhra Pradesh. No middlemen.",
  applicationName: "Go Grameen",
  /* iOS ignores the web manifest's display mode. Without this block, "Add to
     Home Screen" still makes an icon, but tapping it opens Safari's UI around
     the page — it reads as a bookmark, not an app. */
  appleWebApp: {
    capable: true,
    title: "Go Grameen",
    // The header sits on the light page background, so the status bar text has
    // to stay dark; "black-translucent" would run the page under the notch and
    // white out the clock.
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Android tints the status bar with this once installed. Same green as the
  // manifest and SplashScreen so the launch sequence is one colour throughout.
  themeColor: '#1a5c2a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning covers THIS element's attributes only, not the
    // tree below it. Two pre-paint scripts deliberately stamp classes onto
    // <html> before React hydrates — `splash-skip` below, and `gg-dark` from
    // app/home/page.tsx — so the server's className never matches the client's
    // by design. Without this React logs a mismatch on every visit where
    // either one fires.
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full ${fraunces.variable} ${notoSerifTelugu.variable}`}
    >
      <body className="min-h-full bg-gray-50 antialiased">
        {/* Runs before first paint: if the splash already played this session,
            mark <html> so CSS hides the overlay instantly (no green flash on
            navigations). On the very first open it just records the flag and
            lets the overlay paint — which covers the page and kills the
            consumer-page flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem('splash_shown')==='true'){document.documentElement.classList.add('splash-skip')}else{sessionStorage.setItem('splash_shown','true')}}catch(e){}`,
          }}
        />
        <SplashScreen />
        <StagingBanner />
        {/* Invisible: counts this device's install the first time the app is
            launched from the home screen. */}
        <InstallCounter />
        <LanguageProvider>
          <ConsumerAuthProvider>{children}</ConsumerAuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
