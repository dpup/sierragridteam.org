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

test('corridor pins render, one per repeater in the table', async ({ page }) => {
  await loadMesh(page);
  const pins = await page.locator('.mesh-pin').count();
  expect(pins).toBeGreaterThan(0);
  // The map and the panel derive from the same graph — they must not disagree.
  expect(pins).toBe(await page.locator('.mesh-table [data-mesh-row]').count());
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

const card = (page: Page) => page.locator('.mesh-pop:not([hidden])');

test('a table row selects its repeater: pin, card, and a shareable URL', async ({ page }) => {
  await loadMesh(page);
  const row = page.locator('.mesh-table [data-mesh-row]').first();
  const key = await row.getAttribute('data-mesh-row');
  await row.click();
  await expect(page.locator(`.mesh-pin--selected[data-pin-key="${key}"]`)).toHaveCount(1);
  await expect(row).toHaveClass(/mesh-row--selected/);
  // The repeater's card opens on the map once it has zoomed to the repeater's reach.
  await expect(card(page)).toHaveAttribute('aria-label', 'Repeater details');
  await expect(page.locator('.mesh-hint:not([hidden])')).toContainText('Map zoomed to fit');
  expect(new URL(page.url()).searchParams.get('node')).toBe(key);
});

test('clicking a pin does exactly what clicking its table row does', async ({ page }) => {
  await loadMesh(page);
  const key = await page
    .locator('.mesh-table [data-mesh-row]')
    .nth(1)
    .getAttribute('data-mesh-row');
  await page.locator(`.mesh-pin[data-pin-key="${key}"] .mesh-pin__dot`).click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(1);
  await expect(page.locator(`[data-mesh-row="${key}"]`)).toHaveClass(/mesh-row--selected/);
  await expect(card(page)).toHaveCount(1);

  // Esc returns to the corridor: nothing selected, no card, and the URL let go too.
  await page.keyboard.press('Escape');
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.mesh-table .mesh-row--selected')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('node')).toBeNull();
});

test('a second click on the same pin lets go of it, like its row', async ({ page }) => {
  await loadMesh(page);
  const key = await page
    .locator('.mesh-table [data-mesh-row]')
    .first()
    .getAttribute('data-mesh-row');
  const pin = page.locator(`.mesh-pin[data-pin-key="${key}"] .mesh-pin__dot`);
  await pin.click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(1);
  await pin.click();
  await expect(page.locator('.mesh-pin--selected')).toHaveCount(0);
  await expect(page.locator('.mesh-table .mesh-row--selected')).toHaveCount(0);
});

test('a shared ?node= link opens on that repeater', async ({ page }) => {
  await mockMesh(page);
  const key = mesh.node.features[0].properties.mesh.publicKey as string;
  await page.goto(`/mesh?node=${key}`);
  await page.waitForSelector('.mesh-pin', { state: 'attached', timeout: 15000 });
  await expect(page.locator(`.mesh-pin--selected[data-pin-key="${key}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-mesh-row="${key}"]`)).toHaveClass(/mesh-row--selected/);
});

test('mesh has no critical/serious a11y violations with a repeater selected', async ({ page }) => {
  await loadMesh(page);
  // Scan with the repeater card OPEN — it is client-injected (role="dialog"), and axe would
  // otherwise never see it, or the hint chip, or the selected states.
  await page.locator('.mesh-table [data-mesh-row]').first().click();
  await expect(card(page)).toHaveCount(1);

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
