/**
 * Accessibility gate (WCAG 2.2 AA target). Runs axe-core on every page and fails
 * the build on any critical/serious violation. See docs/architecture/accessibility.md.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  { name: 'home', path: '/' },
  { name: 'mesh', path: '/mesh' },
  { name: 'live', path: '/live' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about' },
  { name: 'about-jay', path: '/about/jay' },
  { name: 'about-corrinne', path: '/about/corrinne' },
  { name: 'about-allan', path: '/about/allan' },
  { name: 'about-dan', path: '/about/dan' },
  { name: 'donate', path: '/donate' },
];

for (const pg of pages) {
  test(`${pg.name} has no critical/serious a11y violations`, async ({ page }) => {
    await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
    // /live settles into ready (fetch ok) or failed (feed unreachable) — scan that terminal
    // state, not the loader.
    if (pg.path === '/live') {
      await page
        .waitForSelector('html[data-live-boot="ready"], html[data-live-boot="failed"]', {
          timeout: 12000,
        })
        .catch(() => {});
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      // Exclude the embedded wcmesh live-map iframe — it's third-party content we don't
      // control (its own unlabeled controls would otherwise fail the gate). axe descends
      // into it only when it actually loads (CI), not when the sandbox blocks it. The
      // /mesh chrome around the embed is still scanned.
      .exclude('[data-mesh-frame]')
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    if (serious.length) {
      console.error(
        `\n${pg.name} a11y violations:\n` +
          serious
            .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
            .join('\n')
      );
    }
    expect(serious).toEqual([]);
  });
}
