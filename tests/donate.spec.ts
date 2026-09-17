/**
 * /donate's third-party giving embeds.
 *
 * Zeffy's script cannot be reached from the sandbox this is usually written in, and it does
 * NOT load in the preview CI serves — so the embeds are exercised two ways here: the
 * no-script fallback (what a reader gets when their bundle fails), and a simulation of the
 * DOM their script mounts, which is what actually broke the a11y gate on merge.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Zeffy's embed script fails to load in the preview; block it so the state is deterministic. */
async function blockZeffy(page: import('@playwright/test').Page) {
  await page.route(/zeffy\.com/, (r) => r.abort());
}

test('both giving forms fall back to a plain iframe when Zeffy fails to load', async ({ page }) => {
  await blockZeffy(page);
  await page.goto('/donate');
  await page.waitForTimeout(500);

  // The fallback reveals itself and copies the deferred src onto the iframe. Until then the
  // iframe deliberately has no `src`, so a working embed never loads the form twice.
  const fallbacks = page.locator('[data-zeffy-embed-fallback]');
  await expect(fallbacks).toHaveCount(2);
  for (const display of await fallbacks.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).style.display)
  )) {
    expect(display).toBe('block');
  }
  const srcs = await page
    .locator('.zeffy__iframe')
    .evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  expect(srcs.every((s) => s?.startsWith('https://www.zeffy.com/embed/'))).toBe(true);
});

test('the forms sit side by side when there is room, and stack when there is not', async ({
  page,
}) => {
  await blockZeffy(page);
  for (const [width, expected] of [
    [1440, 2],
    [1024, 2],
    [700, 1],
    [390, 1],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/donate');
    const cols = await page
      .locator('.donate-forms')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect({ width, cols }).toEqual({ width, cols: expected });
    // …and never overflows sideways at any of them.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect({ width, overflows }).toEqual({ width, overflows: false });
  }
});

test('the DOM Zeffy injects is given accessible names', async ({ page }) => {
  await blockZeffy(page);
  await page.goto('/donate');

  // Reproduce what their script mounts into our page: an untitled payment iframe and their
  // logo link, whose only content is an unlabelled SVG. Both failed the a11y gate on merge —
  // they land in OUR document, so they are ours to label.
  await page.evaluate(() => {
    for (const mount of document.querySelectorAll('[data-zeffy-embed]')) {
      const frame = document.createElement('iframe');
      frame.src = 'about:blank';
      mount.appendChild(frame);
      const link = document.createElement('a');
      link.href = 'https://www.zeffy.com/home/100-free-for-donors?utm_source=freeforms';
      link.setAttribute('data-test', 'zeffy-logo-wrapper');
      link.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      mount.appendChild(link);
    }
  });
  // The MutationObserver is async; give it a tick.
  await page.waitForTimeout(200);

  // Guard against a vacuous pass: the simulated nodes must actually be present. Two fallback
  // iframes plus the two just injected, and one logo link per embed.
  expect(await page.locator('.zeffy iframe').count()).toBe(4);
  expect(await page.locator('.zeffy a[href*="zeffy.com"]').count()).toBe(2);

  expect(await page.locator('.zeffy iframe:not([title])').count()).toBe(0);
  expect(await page.locator('.zeffy a[href*="zeffy.com"]:not([aria-label])').count()).toBe(0);

  // And the page as a whole still clears the gate with that DOM present.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (serious.length) {
    console.error(
      '\ndonate (with simulated Zeffy DOM) a11y violations:\n' +
        serious
          .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
          .join('\n')
    );
  }
  expect(serious).toEqual([]);
});
