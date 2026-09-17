/**
 * /mesh map tests, run against the BUILT site with the feed mocked from the checked-in
 * fixture.
 *
 * Why this file exists: the a11y + smoke suites hit a preview that cannot reach
 * data.sierragridteam.org, so /mesh renders its honest "feed unavailable" state and the map's
 * corridor pins never exist. Every interactive part of the map therefore went untested — and
 * a real bug shipped through that gap: `.mesh-pin` set `position: relative`, which ties with
 * MapLibre's own `.maplibregl-marker { position: absolute }` on specificity, so the winner
 * came down to stylesheet order. Dev and the production bundle order them differently, so
 * the map looked right all through development and every marker collapsed into the corner
 * of the map once built.
 *
 * The lesson generalised: anything that only appears once the feed resolves needs a mocked
 * run to be covered at all, and marker positioning has to be asserted on the built output.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mesh = JSON.parse(readFileSync(resolve(root, 'src/data/mesh-snapshot.json'), 'utf8'));

/** Background-only style so MapLibre's `load` fires without any network. */
const OFFLINE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#efe7d6' } }],
};

async function mockMesh(page: Page) {
  await page.route(/data\.sierragridteam\.org/, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      });
    const layer = url.match(/\/map\/([^/?]+)\.geojson/)?.[1];
    if (layer === 'mesh_node') return json(mesh.node);
    if (layer === 'mesh_link') return json(mesh.link);
    if (layer)
      return json({ type: 'FeatureCollection', features: [], metadata: { sourceStatus: 'OK' } });
    // The whole-mesh backdrop only loads on pan-out; keep it empty and offline.
    if (url.includes('/mesh/links')) return json({ window: '30d', links: [] });
    if (url.includes('/events')) return json({ events: [] });
    return json({});
  });
  await page.route(/tiles\.openfreemap\.org\//, (r) => r.abort());
  await page.route(/tiles\.openfreemap\.org\/styles\//, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OFFLINE_STYLE) })
  );
}

async function loadMesh(page: Page) {
  await mockMesh(page);
  await page.goto('/mesh');
  // `attached`, not the default `visible`: the pin wrapper is a 0x0 coordinate anchor (its
  // dot and label are what have size), so Playwright never considers it visible.
  await page.waitForSelector('.mesh-pin', { state: 'attached', timeout: 15000 });
  await page.waitForSelector('html[data-map-settled]', { timeout: 10000 }).catch(() => {});
}

test('corridor pins render, one per repeater in the roster', async ({ page }) => {
  await loadMesh(page);
  const pins = await page.locator('.mesh-pin').count();
  expect(pins).toBeGreaterThan(0);
  // The map and the panel derive from the same graph — they must not disagree.
  expect(pins).toBe(await page.locator('.mesh-roster [data-mesh-node]').count());
});

test('pins keep MapLibre positioning and land on the map, not stacked in a corner', async ({
  page,
}) => {
  await loadMesh(page);

  // The actual regression: our class must not beat .maplibregl-marker's `position: absolute`.
  const positions = await page.$$eval('.mesh-pin', (els) =>
    els.map((e) => getComputedStyle(e).position)
  );
  expect(new Set(positions)).toEqual(new Set(['absolute']));

  const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
  expect(canvas).not.toBeNull();

  const dots = await page.$$eval('.mesh-pin .mesh-pin__dot', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })
  );

  // Every dot inside the map viewport…
  for (const d of dots) {
    expect(d.x).toBeGreaterThanOrEqual(canvas!.x);
    expect(d.x).toBeLessThanOrEqual(canvas!.x + canvas!.width);
    expect(d.y).toBeGreaterThanOrEqual(canvas!.y);
    expect(d.y).toBeLessThanOrEqual(canvas!.y + canvas!.height);
  }
  // …and SPREAD OUT. When markers lose absolute positioning they collapse onto one point,
  // which the bounds check above alone would not catch.
  //
  // Measured as "no pixel holds a crowd", not as "every pin has a unique pixel" and not as
  // a share of the canvas:
  //   • two repeaters really can share a site — Pinebrook Rptr and Pinebrook Tree are ~85 m
  //     apart and round to the same pixel now the map column is half the page wide;
  //   • the service-area bounds are wider than the repeater cluster, so the pins legitimately
  //     use only about a fifth of the canvas horizontally.
  // When positioning breaks, all twelve land on one point — that is what this catches.
  const perPixel = new Map<string, number>();
  for (const d of dots) {
    const k = `${Math.round(d.x)},${Math.round(d.y)}`;
    perPixel.set(k, (perPixel.get(k) ?? 0) + 1);
  }
  expect(Math.max(...perPixel.values())).toBeLessThanOrEqual(2);
});

test('a roster row selects its repeater on the map', async ({ page }) => {
  await loadMesh(page);
  // The panel selects and frames; it deliberately does NOT open a map card — the reading
  // opens inline in the row instead, and a card would cover the map it just flew to.
  await page.locator('.mesh-roster [data-mesh-node]').first().click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(1);
  await expect(page.locator('.mesh-pop')).toHaveCount(0);
});

test('a monitored row expands inline to its reading, and closes again', async ({ page }) => {
  await loadMesh(page);
  // Only a monitored repeater offers the disclosure — a chevron on a row that expands to
  // nothing would be a promise the page cannot keep.
  const row = page.locator('.mesh-roster [data-mesh-node][aria-expanded]').first();
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.mesh-detail')).toHaveCount(0);

  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  // Inline: the panel is a sibling inside the SAME <li> as the row that opened it. That
  // adjacency is the whole point — it lived below the entire roster once and was missed.
  const detail = page.locator('.mesh-roster__item--open .mesh-detail');
  await expect(detail).toHaveCount(1);
  await expect(detail.locator('.mesh-metric')).toHaveCount(3);

  // Second click closes it: a disclosure, not a one-way trip.
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.mesh-detail')).toHaveCount(0);
});

test('an unmonitored repeater offers no disclosure at all', async ({ page }) => {
  await loadMesh(page);
  const rows = page.locator('.mesh-roster [data-mesh-node]');
  const total = await rows.count();
  const expandable = await page.locator('.mesh-roster [data-mesh-node][aria-expanded]').count();
  // The fixture deliberately has both kinds — if every repeater were monitored, the
  // "Limited Telemetry" path would stop being exercised anywhere.
  expect(expandable).toBeGreaterThan(0);
  expect(expandable).toBeLessThan(total);
  await expect(page.locator('.mesh-health__none').first()).toBeVisible();
});

test('clicking a corridor pin does exactly what clicking its roster row does', async ({ page }) => {
  await loadMesh(page);
  // Pick a MONITORED repeater: only those have a reading to expand, so only they prove the
  // pin and the row end in the same place.
  const key = await page
    .locator('.mesh-roster [data-mesh-node][aria-expanded]')
    .first()
    .getAttribute('data-mesh-node');
  const pin = page.locator(`.mesh-pin[data-pin-key="${key}"] .mesh-pin__dot`);

  // A corridor pin no longer opens a map card: it HAS a roster row, and that row is the one
  // detail surface. Two surfaces for one repeater showed different subsets of the same
  // facts, and the card covered the map it had just flown to.
  await pin.click();
  await expect(page.locator('.mesh-pop')).toHaveCount(0);
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(1);

  // …and the panel row opened, exactly as if the row itself had been clicked.
  const open = page.locator('.mesh-roster__item--open');
  await expect(open).toHaveCount(1);
  await expect(open.locator(`[data-mesh-node="${key}"][aria-expanded="true"]`)).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(0);
});

test('a second click on the same pin clears it, like its roster row', async ({ page }) => {
  await loadMesh(page);
  const key = await page
    .locator('.mesh-roster [data-mesh-node][aria-expanded]')
    .first()
    .getAttribute('data-mesh-node');
  const pin = page.locator(`.mesh-pin[data-pin-key="${key}"] .mesh-pin__dot`);

  await pin.click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(1);
  await expect(page.locator('.mesh-roster__item--open')).toHaveCount(1);

  // Toggling off: without this the only way to let go of a repeater was to find bare map or
  // press Escape, neither of which the pin suggests.
  await pin.click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(0);
  await expect(page.locator('.mesh-roster__item--open')).toHaveCount(0);
});

test('mesh has no critical/serious a11y violations with the map populated', async ({ page }) => {
  await loadMesh(page);
  // Scan with a roster row EXPANDED — the disclosure, its chevron and the metric row are
  // client-injected and axe would otherwise never see them.
  //
  // NOTE: this used to open a node card to scan the popover's role="dialog". Corridor pins
  // no longer open one, and the card now belongs to neighbour dots and links — both drawn
  // into the WebGL canvas, so neither is clickable from here. `.mesh-pop` markup is
  // therefore not covered by axe; keep that in mind when changing `popShell`.
  await page.locator('.mesh-roster [data-mesh-node][aria-expanded]').first().click();
  await expect(page.locator('.mesh-roster__item--open .mesh-detail')).toHaveCount(1);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (serious.length) {
    console.error(
      '\nmesh (populated) a11y violations:\n' +
        serious
          .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
          .join('\n')
    );
  }
  expect(serious).toEqual([]);
});
