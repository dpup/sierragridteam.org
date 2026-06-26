/**
 * Deterministic screenshots for visual QA + regression. Captures every page at
 * three viewports with:
 *   - a FROZEN clock (stable LocalClock + "Synced" stamps),
 *   - MOCKED info.ersn.net responses (stable data states),
 *   - DISABLED animations + reduced motion,
 * so the PNGs are byte-stable and safe to diff or analyze.
 *
 * Requires the built site served at BASE_URL (default http://localhost:4321).
 * Run: `npm run screenshots` after `npm run build` + `astro preview`.
 * Optional: SCENARIO=redflag to render the alarm state.
 */
import { chromium, type Route } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'tests/screenshots');
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const SCENARIO = process.env.SCENARIO ?? 'calm';
const FIXED = new Date('2026-06-25T13:30:00-07:00'); // 13:30 PT, stable

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'w1000', width: 1000, height: 900 },
  { name: 'w880', width: 880, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

const pages = [
  { name: 'home', path: '/' },
  { name: 'mesh', path: '/mesh' },
  { name: 'alerts', path: '/alerts' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about' },
  { name: 'donate', path: '/donate' },
  { name: 'notfound', path: '/this-route-does-not-exist' },
];

const snapshot = JSON.parse(readFileSync(resolve(root, 'src/data/ersn-snapshot.json'), 'utf8'));
const redflag = JSON.parse(
  readFileSync(resolve(root, 'src/data/__fixtures__/alerts-redflag.json'), 'utf8')
);

function mockErsn(route: Route) {
  const url = route.request().url();
  const json = (body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  if (url.includes('/weather/alerts')) {
    return json(
      SCENARIO === 'redflag' ? redflag : { alerts: [], lastUpdated: FIXED.toISOString() }
    );
  }
  if (url.includes('/weather')) return json(snapshot.weather);
  if (url.includes('/roads')) return json(snapshot.roads);
  return json({});
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let count = 0;

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    await ctx.route(/info\.ersn\.net/, mockErsn);

    for (const pg of pages) {
      const page = await ctx.newPage();
      await page.clock.setFixedTime(FIXED);
      await page.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle' });
      // Kill any residual motion + the text caret for byte-stability.
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
      });
      await page.evaluate(() => (document as Document).fonts.ready);
      await page.waitForTimeout(150);
      // Full page (whole scroll) + above-the-fold (viewport only) — the fold shot
      // surfaces top-of-page issues like the nav/header overlap and the hero on tablet.
      await page.screenshot({ path: resolve(OUT, `${pg.name}-${vp.name}.png`), fullPage: true });
      await page.screenshot({
        path: resolve(OUT, `${pg.name}-${vp.name}-fold.png`),
        fullPage: false,
      });
      await page.close();
      count++;
      console.error(`✓ ${pg.name} @ ${vp.name}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.error(`\nCaptured ${count} screenshots → ${OUT} (scenario: ${SCENARIO})`);
}

main().catch((err) => {
  console.error('screenshots failed:', err);
  process.exit(1);
});
