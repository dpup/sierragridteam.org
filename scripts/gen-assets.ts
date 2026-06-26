/**
 * Generates raster brand/SEO assets from the master logo, deterministically.
 * Run: `npm run gen-assets` (or `bun run scripts/gen-assets.ts`).
 *
 * Outputs (committed to public/):
 *  - brand/sierra-mark.png   the mark only (mountain + arcs), cropped + trimmed
 *  - favicon-32.png, favicon-16.png, apple-touch-icon.png
 *
 * favicon.svg and site.webmanifest are authored by hand (not generated).
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const SRC = resolve(pub, 'brand/sierra-logo-full.png');

// Brand tokens (mirrors src/styles/tokens.css — keep in sync if the palette changes).
const PARCHMENT = '#f3efe4';

async function markBuffer(): Promise<Buffer> {
  // The mark occupies the top ~160px of the 294×248 master (gap to wordmark at ~160).
  // Extract and trim in separate passes — sharp rejects extract+trim in one pipeline.
  const { width, height } = await sharp(SRC).metadata();
  const cropH = Math.min(160, height ?? 160);
  const cropped = await sharp(SRC)
    .extract({ left: 0, top: 0, width: width ?? 294, height: cropH })
    .png()
    .toBuffer();
  return sharp(cropped).trim().png().toBuffer();
}

async function main() {
  const mark = await markBuffer();

  // 1) The mark, for the nav compact lockup + hero emblem.
  await sharp(mark).toFile(resolve(pub, 'brand/sierra-mark.png'));

  // 2) Favicons + apple-touch: mark centered on a parchment square.
  await (await composeSquare(mark, 180, 26)).toFile(resolve(pub, 'apple-touch-icon.png'));
  await (await composeSquare(mark, 32, 3)).toFile(resolve(pub, 'favicon-32.png'));
  await (await composeSquare(mark, 16, 1)).toFile(resolve(pub, 'favicon-16.png'));

  // OG cards are generated dynamically per page at build time (src/pages/og/[slug].png.ts).

  console.error('Generated brand + SEO raster assets in public/.');
}

async function composeSquare(mark: Buffer, size: number, pad: number) {
  const inner = await sharp(mark)
    .resize({ width: size - pad * 2, fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: PARCHMENT },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png();
}

main().catch((err) => {
  console.error('gen-assets failed:', err);
  process.exit(1);
});
