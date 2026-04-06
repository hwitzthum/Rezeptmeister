/**
 * PWA Icon Generator for Rezeptmeister
 * Creates app icons in 192, 384, 512 (+ maskable) sizes.
 * Uses the design system colors: Terrakotta #C24D2C on Cremeweis #FFF8F0.
 *
 * Usage: npx tsx scripts/generate-pwa-icons.ts
 */

import sharp from "sharp";
import path from "path";

const SIZES = [192, 384, 512];
const OUT_DIR = path.resolve(__dirname, "../public/icons");

const TERRAKOTTA = "#C24D2C";
const CREMEWEIS = "#FFF8F0";

function createIconSvg(size: number, maskable: boolean): string {
  const padding = maskable ? Math.round(size * 0.1) : 0;
  const innerSize = size - padding * 2;
  const fontSize = Math.round(innerSize * 0.55);
  const cx = size / 2;
  const cy = size / 2;

  // Chef hat / recipe icon simplified as "R" monogram on terrakotta circle
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${maskable ? CREMEWEIS : "none"}" rx="0"/>
  <circle cx="${cx}" cy="${cy}" r="${innerSize * 0.45}" fill="${TERRAKOTTA}"/>
  <text x="${cx}" y="${cy}" dominant-baseline="central" text-anchor="middle"
        font-family="Georgia, 'Playfair Display', serif" font-weight="700"
        font-size="${fontSize}" fill="${CREMEWEIS}" letter-spacing="-2">R</text>
</svg>`;
}

async function main() {
  for (const size of SIZES) {
    // Standard icon
    const svg = createIconSvg(size, false);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`));
    console.log(`✓ icon-${size}x${size}.png`);
  }

  // Maskable 512 (extra safe-zone padding)
  const maskableSvg = createIconSvg(512, true);
  await sharp(Buffer.from(maskableSvg))
    .png()
    .toFile(path.join(OUT_DIR, "icon-512x512-maskable.png"));
  console.log("✓ icon-512x512-maskable.png");

  console.log("\nDone — icons written to public/icons/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
