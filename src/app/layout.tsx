import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import { ConsumerAuthProvider } from "@/lib/ConsumerAuthContext";
import SplashScreen from "@/components/SplashScreen";

export const metadata: Metadata = {
  title: "Go Grameen — Your Family Farmer",
  description: "Buy natural produce directly from farmers in Andhra Pradesh. No middlemen.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
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
        <LanguageProvider>
          <ConsumerAuthProvider>{children}</ConsumerAuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
