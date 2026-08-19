import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Serif_Telugu } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import { ConsumerAuthProvider } from "@/lib/ConsumerAuthContext";
import SplashScreen from "@/components/SplashScreen";
import StagingBanner from "@/components/StagingBanner";
import InstallCounter from "@/components/InstallCounter";

/* Brand type. Fraunces carries the Latin wordmark (soft, slightly wonky serif
   — the farm-to-table look); it has no Telugu glyphs, so Noto Serif Telugu
   sits next to it in the same stack and the browser falls back per glyph when
   the UI is in Telugu. Both are self-hosted by next/font, so the wordmark
   costs no third-party round-trip on 4G. Only the logo lockup uses them —
   body copy stays on the system stack. */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
  variable: "--font-brand",
});

const notoSerifTelugu = Noto_Serif_Telugu({
  subsets: ["telugu"],
  display: "swap",
  variable: "--font-brand-te",
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
    <html lang="en" className={`h-full ${fraunces.variable} ${notoSerifTelugu.variable}`}>
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
