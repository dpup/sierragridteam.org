/**
 * Deterministic screenshots for visual QA + regression. Captures every page at
 * three viewports with:
 *   - a FROZEN clock (stable LocalClock + "Synced" stamps),
 *   - MOCKED info.ersn.net responses (stable data states),
 *   - DISABLED animations + reduced motion,
 * so the PNGs are byte-stable and safe to diff or analyze.
 *
 * Requires the built site served at BASE_URL (default http://localhost:4321).
 * Build the SSR with the CHECKED-IN snapshot so the SSR-only sections (road
 * conditions, current conditions, incidents) are byte-stable:
 *   ERSN_FETCH_AT_BUILD=0 npm run build && npm run preview & npm run screenshots
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

// The "redflag" alarm scenario: a realistic fire-season foothill event modeled on the
// real NWS Sacramento alert shape (see info.ersn.net tests/testdata/weather). A Red Flag
// Warning + a co-occurring High Wind Warning (wind drives red-flag conditions) so the
// AlertsFeed renders multiple cards, plus fireWeather.state = RED_FLAG (FR-3) escalates
// the Fire Weather tile to orange.
const redflagAlerts = [
  {
    id: 'urn:test:redflag',
    senderName: 'NWS Sacramento CA',
    event: 'Red Flag Warning',
    description:
      'Gusty north winds and single-digit humidity will create critical fire weather ' +
      'conditions across the Mother Lode and Sierra foothills. Any fire that develops will ' +
      'likely spread rapidly.',
    headline: 'Red Flag Warning in effect from 11 AM to 8 PM PDT',
    source: 'NWS',
    severity: 'CRITICAL',
    zones: ['CAZ069'],
    startTime: '2026-06-25T18:00:00Z',
    endTime: '2026-06-26T03:00:00Z',
  },
  {
    id: 'urn:test:wind',
    senderName: 'NWS Sacramento CA',
    event: 'High Wind Warning',
    description:
      'North winds 25 to 35 mph with gusts up to 60 mph expected across the Motherlode and ' +
      'Northeast Foothills. Strong winds could blow down trees and power lines.',
    headline: 'High Wind Warning in effect until 8 PM PDT',
    source: 'NWS',
    severity: 'WARNING',
    zones: ['CAZ067'],
    startTime: '2026-06-25T17:00:00Z',
    endTime: '2026-06-26T03:00:00Z',
  },
];

function mockErsn(route: Route) {
  const url = route.request().url();
  const json = (body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  // Order matters: '/weather/alerts' and '/incidents' before the bare '/weather'.
  if (url.includes('/weather/alerts')) {
    // 'calm' = the common quiet state (no active alerts); 'redflag' = the alarm.
    return json(
      SCENARIO === 'redflag'
        ? { alerts: redflagAlerts, lastUpdated: FIXED.toISOString() }
        : { alerts: [], lastUpdated: FIXED.toISOString() }
    );
  }
  if (url.includes('/incidents')) return json(snapshot.incidents);
  if (url.includes('/weather')) {
    const w = snapshot.weather;
    return json(
      SCENARIO === 'redflag' ? { ...w, fireWeather: { ...w.fireWeather, state: 'RED_FLAG' } } : w
    );
  }
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
