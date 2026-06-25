/**
 * Generates raster brand/SEO assets from the master logo, deterministically.
 * Run: `npm run gen-assets` (or `bun run scripts/gen-assets.ts`).
 *
 * Outputs (committed to public/):
 *  - brand/sierra-mark.png   the mark only (mountain + arcs), cropped + trimmed
 *  - favicon-32.png, favicon-16.png, apple-touch-icon.png
 *  - og-default.png          1200×630 social card
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
const GREEN = { r: 29, g: 91, b: 63 };

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

  // 3) OG card 1200×630: parchment field, full logo centered.
  const logo = await sharp(SRC).resize({ width: 360, fit: 'inside' }).png().toBuffer();
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: PARCHMENT },
  })
    .composite([
      // subtle green baseline rule near the bottom
      {
        input: {
          create: { width: 1200, height: 6, channels: 4, background: GREEN },
        },
        top: 560,
        left: 0,
      },
      { input: logo, gravity: 'center' },
    ])
    .png()
    .toFile(resolve(pub, 'og-default.png'));

  console.error('Generated brand + SEO raster assets in public/.');
}

async function composeSquare(mark: Buffer, size: number, pad: number) {
  const inner = await sharp(mark).resize({ width: size - pad * 2, fit: 'inside' }).png().toBuffer();
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
