import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import { ConsumerAuthProvider } from "@/lib/ConsumerAuthContext";

export const metadata: Metadata = {
  title: "YourFamilyFarmer — Natural food from farmers near you",
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
        <LanguageProvider>
          <ConsumerAuthProvider>{children}</ConsumerAuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
