/**
 * PWA Icon Generator for Rezeptmeister
 * Creates app icons in 96, 144, 192, 384, 512 (+ maskable) sizes
 * plus the opaque 180x180 apple-touch-icon iOS requires.
 * Uses the design system colors: Terrakotta #C24D2C on Cremeweis #FFF8F0.
 *
 * Usage: npx tsx scripts/generate-pwa-icons.ts
 */

import sharp from "sharp";
import path from "path";

const SIZES = [96, 144, 192, 384, 512];
const OUT_DIR = path.resolve(__dirname, "../public/icons");
const PUBLIC_DIR = path.resolve(__dirname, "../public");

// iOS masks the touch icon itself and composites black behind transparency,
// so it needs a full-bleed opaque background and no maskable safe zone.
const APPLE_TOUCH_SIZE = 180;

const TERRAKOTTA = "#C24D2C";
const CREMEWEIS = "#FFF8F0";

type IconVariant = "standard" | "maskable" | "apple";

function createIconSvg(size: number, variant: IconVariant): string {
  const padding = variant === "maskable" ? Math.round(size * 0.1) : 0;
  const innerSize = size - padding * 2;
  const fontSize = Math.round(innerSize * 0.55);
  const cx = size / 2;
  const cy = size / 2;
  const background = variant === "standard" ? "none" : CREMEWEIS;

  // Chef hat / recipe icon simplified as "R" monogram on terrakotta circle
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${background}" rx="0"/>
  <circle cx="${cx}" cy="${cy}" r="${innerSize * 0.45}" fill="${TERRAKOTTA}"/>
  <text x="${cx}" y="${cy}" dominant-baseline="central" text-anchor="middle"
        font-family="Georgia, 'Playfair Display', serif" font-weight="700"
        font-size="${fontSize}" fill="${CREMEWEIS}" letter-spacing="-2">R</text>
</svg>`;
}

async function main() {
  for (const size of SIZES) {
    // Standard icon
    const svg = createIconSvg(size, "standard");
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`));
    console.log(`✓ icon-${size}x${size}.png`);
  }

  // Maskable 512 (extra safe-zone padding)
  const maskableSvg = createIconSvg(512, "maskable");
  await sharp(Buffer.from(maskableSvg))
    .png()
    .toFile(path.join(OUT_DIR, "icon-512x512-maskable.png"));
  console.log("✓ icon-512x512-maskable.png");

  // apple-touch-icon at the document root: Safari probes /apple-touch-icon.png
  // when adding to the home screen, and flatten() guarantees zero alpha.
  const appleSvg = createIconSvg(APPLE_TOUCH_SIZE, "apple");
  await sharp(Buffer.from(appleSvg))
    .flatten({ background: CREMEWEIS })
    .png()
    .toFile(path.join(PUBLIC_DIR, "apple-touch-icon.png"));
  console.log("✓ apple-touch-icon.png");

  console.log("\nDone — icons written to public/icons/ and public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
