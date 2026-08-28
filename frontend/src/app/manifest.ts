import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rezeptmeister",
    short_name: "Rezeptmeister",
    description:
      "KI-gestützte Rezeptverwaltung für die Schweizer Küche. Rezepte erfassen, verwalten und entdecken.",
    start_url: "/",
    display: "standalone",
    // minimal-ui als Rückfall für Browser ohne standalone-Unterstützung
    display_override: ["standalone", "minimal-ui"],
    background_color: "#FFF8F0",
    theme_color: "#C24D2C",
    // "any" statt "portrait-primary": sonst bleibt das iPad im Querformat quer stehen
    orientation: "any",
    categories: ["food", "lifestyle"],
    lang: "de-CH",
    icons: [
      {
        src: "/icons/icon-96x96.png",
        sizes: "96x96",
        type: "image/png",
      },
      {
        src: "/icons/icon-144x144.png",
        sizes: "144x144",
        type: "image/png",
      },
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
    shortcuts: [
      {
        name: "Rezept abfotografieren",
        short_name: "Abfotografieren",
        description: "Ein Rezept mit der Kamera erfassen",
        url: "/rezepte/scannen",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Von URL importieren",
        short_name: "URL-Import",
        description: "Ein Rezept von einer Webseite übernehmen",
        url: "/rezepte/importieren",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Einkaufsliste",
        short_name: "Einkaufen",
        description: "Die Einkaufsliste öffnen",
        url: "/einkaufsliste",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
    // Android-Teilen-Sheet: geteilte Links landen im URL-Import.
    // iOS kennt kein share_target — dort übernimmt der Kurzbefehl aus A4.4.
    share_target: {
      action: "/rezepte/importieren",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
