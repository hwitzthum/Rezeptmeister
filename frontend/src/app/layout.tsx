import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/layout/ServiceWorkerRegistration";

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
  themeColor: "#C24D2C",
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
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
