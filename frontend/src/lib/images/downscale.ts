/**
 * Client-seitiges Verkleinern von Fotos vor dem Upload.
 *
 * Handy-Kameras liefern 3–5 MB grosse Aufnahmen (12 MP und mehr). Die
 * Upload-Route lehnt alles über 10 MB ab, und über Mobilfunk dauert schon ein
 * 4-MB-Upload unangenehm lange. Für OCR bringt mehr als ~2000 px Kantenlänge
 * keinen Erkenntnisgewinn — also wird lokal per Canvas verkleinert.
 *
 * Wichtig: `createImageBitmap` wird mit `imageOrientation: "from-image"`
 * aufgerufen. Ohne das landen hochkant fotografierte Buchseiten gedreht beim
 * OCR, weil die EXIF-Orientierung beim Neu-Kodieren verloren geht.
 */

/** Maximale Kantenlänge des verkleinerten Bildes in Pixeln. */
export const DEFAULT_MAX_EDGE = 2000;

/** JPEG-Qualität des verkleinerten Bildes. */
export const DEFAULT_QUALITY = 0.85;

export interface TargetSize {
  width: number;
  height: number;
  /** true, wenn tatsächlich verkleinert wird (Originalkante > maxEdge). */
  resized: boolean;
}

/**
 * Reine Rechenlogik der Zielmasse — bewusst ohne Canvas, damit sie testbar ist.
 *
 * Behält das Seitenverhältnis bei und begrenzt die längere Kante auf `maxEdge`.
 * Bilder, die bereits klein genug sind, bleiben unverändert (kein Hochskalieren).
 */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number = DEFAULT_MAX_EDGE,
): TargetSize {
  const valid =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(maxEdge) &&
    width > 0 &&
    height > 0 &&
    maxEdge > 0;

  if (!valid) {
    return { width, height, resized: false };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height, resized: false };
  }

  const scale = maxEdge / longestEdge;
  return {
    // Mindestens 1 px, damit extreme Panorama-Seitenverhältnisse keine
    // 0-px-Kante erzeugen (Canvas wirft dann).
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

export interface DownscaleOptions {
  maxEdge?: number;
  quality?: number;
}

/** Ersetzt die Dateiendung durch `.jpg` — der Canvas gibt immer JPEG aus. */
function toJpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "seite"}.jpg`;
}

async function drawToJpegBlob(
  bitmap: ImageBitmap,
  target: TargetSize,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(target.width, target.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Verkleinert ein Foto auf max. `maxEdge` px Kantenlänge und kodiert es als
 * JPEG neu (EXIF-Orientierung wird dabei eingerechnet, nicht mitgeschleppt).
 *
 * Schlägt irgendein Schritt fehl (kein Canvas-Kontext, `createImageBitmap`
 * nicht verfügbar, defektes Bild), wird die Originaldatei zurückgegeben — der
 * Upload soll an einer Optimierung nie scheitern.
 */
export async function downscaleImage(
  file: File,
  options: DownscaleOptions = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const target = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
    const blob = await drawToJpegBlob(bitmap, target, quality);
    if (!blob) return file;

    // Ohne Verkleinerung lohnt sich das Neu-Kodieren nur, wenn es die Datei
    // wirklich kleiner macht — sonst bleibt das Original erhalten.
    if (!target.resized && blob.size >= file.size) return file;

    return new File([blob], toJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
