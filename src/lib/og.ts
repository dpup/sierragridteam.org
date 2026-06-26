/**
 * Dynamic Open Graph card renderer (build-time only). Composes an on-brand 1200×630
 * card with satori (HTML → SVG) + resvg (SVG → PNG), using the self-hosted brand
 * fonts and the logo mark. Used by the /og/[slug].png endpoint.
 *
 * SERVER/BUILD ONLY — imports native deps; never import from client code.
 *
 * satori quirk: every <div> with children must declare display:flex (we add it to
 * all divs, and strip inter-tag whitespace so stray text nodes don't trip the rule).
 */
import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const fontFile = (p: string) => readFileSync(resolve(ROOT, 'node_modules/@fontsource', p));

const FONTS = [
  {
    name: 'Newsreader',
    weight: 400 as const,
    style: 'normal' as const,
    data: fontFile('newsreader/files/newsreader-latin-400-normal.woff'),
  },
  {
    name: 'Newsreader',
    weight: 600 as const,
    style: 'normal' as const,
    data: fontFile('newsreader/files/newsreader-latin-600-normal.woff'),
  },
  {
    name: 'Plex',
    weight: 600 as const,
    style: 'normal' as const,
    data: fontFile('ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff'),
  },
  {
    name: 'PlexMono',
    weight: 500 as const,
    style: 'normal' as const,
    data: fontFile('ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff'),
  },
];

const MARK =
  'data:image/png;base64,' +
  readFileSync(resolve(ROOT, 'public/brand/sierra-mark.png')).toString('base64');

export interface OgCard {
  kicker: string;
  title: string;
  subtitle: string;
}

function esc(s: string): string {
  // satori-html renders text verbatim (no entity decoding), so a literal '&' is correct;
  // strip angle brackets (never present in our config titles) to keep the markup valid.
  return s.replace(/[<>]/g, '');
}

export async function renderOgCard({
  kicker,
  title,
  subtitle,
}: OgCard): Promise<Uint8Array<ArrayBuffer>> {
  // Brand tokens inline (this PNG can't reference CSS vars). Mirrors src/styles/tokens.css.
  const tpl = `
    <div style="display:flex;flex-direction:column;position:relative;width:1200px;height:630px;background:#f3efe4;padding:72px;font-family:Newsreader;">
      <div style="display:flex;position:absolute;top:0;left:0;right:0;height:10px;background:#1d5b3f;"></div>
      <div style="display:flex;position:absolute;top:98px;right:72px;align-items:center;">
        <div style="display:flex;width:14px;height:14px;border-radius:14px;background:#1d5b3f;"></div>
        <div style="display:flex;width:64px;height:2px;background:#b08a3e;"></div>
        <div style="display:flex;width:14px;height:14px;border-radius:14px;background:#b08a3e;"></div>
        <div style="display:flex;width:64px;height:2px;background:#b08a3e;"></div>
        <div style="display:flex;width:14px;height:14px;border-radius:14px;background:#c2410c;"></div>
      </div>
      <img src="${MARK}" width="137" height="78" style="height:78px;width:137px;margin-bottom:40px;" />
      <div style="display:flex;font-family:Plex;font-size:22px;font-weight:600;letter-spacing:4px;color:#785d20;text-transform:uppercase;margin-bottom:18px;">${esc(kicker)}</div>
      <div style="display:flex;font-size:64px;font-weight:600;line-height:1.05;letter-spacing:-1px;color:#16271e;max-width:920px;">${esc(title)}</div>
      <div style="display:flex;font-size:29px;line-height:1.4;color:#3c453c;max-width:840px;margin-top:24px;">${esc(subtitle)}</div>
      <div style="display:flex;flex:1;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid #d8d0bd;padding-top:24px;">
        <div style="display:flex;font-family:Plex;font-size:19px;font-weight:600;letter-spacing:1px;color:#5a5e4f;">Signal Integrity & Emergency Radio Response Alliance</div>
        <div style="display:flex;font-family:PlexMono;font-size:19px;color:#1d5b3f;">sierragridteam.org</div>
      </div>
    </div>`
    .replace(/>\s+</g, '><')
    .trim();

  const svg = await satori(html(tpl), { width: 1200, height: 630, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  // Copy into a fresh ArrayBuffer-backed view so the type satisfies BlobPart (TS 5.7+).
  const out = new Uint8Array(png.byteLength);
  out.set(png);
  return out;
}
