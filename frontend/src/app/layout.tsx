import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/layout/ServiceWorkerRegistration";
import ThemeProvider from "@/components/layout/ThemeProvider";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets env(safe-area-inset-*) resolve to real values on notched devices.
  // Zoom stays enabled on purpose (kein maximumScale / userScalable: false).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF8F0" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1A16" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Rezeptmeister",
    template: "%s · Rezeptmeister",
  },
  description:
    "KI-gestützte Rezeptverwaltung für die Schweizer Küche. Rezepte erfassen, verwalten und entdecken.",
  keywords: ["Rezepte", "Kochen", "Schweiz", "Küche", "KI", "Rezeptverwaltung"],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rezeptmeister",
  },
  icons: {
    icon: [
      { url: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de-CH"
      className={`${playfair.variable} ${dmSans.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider>
          {children}
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
