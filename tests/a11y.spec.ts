/**
 * Accessibility gate (WCAG 2.2 AA target). Runs axe-core on every page and fails
 * the build on any critical/serious violation. See docs/architecture/accessibility.md.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  { name: 'home', path: '/' },
  { name: 'mesh', path: '/mesh' },
  { name: 'alerts', path: '/alerts' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about' },
  { name: 'donate', path: '/donate' },
];

for (const pg of pages) {
  test(`${pg.name} has no critical/serious a11y violations`, async ({ page }) => {
    await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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
