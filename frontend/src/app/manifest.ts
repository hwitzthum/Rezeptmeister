import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rezeptmeister",
    short_name: "Rezeptmeister",
    description:
      "KI-gestützte Rezeptverwaltung für die Schweizer Küche. Rezepte erfassen, verwalten und entdecken.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#C24D2C",
    orientation: "portrait-primary",
    categories: ["food", "lifestyle"],
    lang: "de-CH",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
