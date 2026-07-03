/**
 * Smoke tests: every page renders with the expected landmarks, a single H1, a
 * non-empty <title>, canonical link, and the global nav + footer.
 */
import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home', path: '/', h1: /signal stays up/i },
  { name: 'mesh', path: '/mesh', h1: /mesh network/i },
  { name: 'blog', path: '/blog', h1: /notes from the foothills/i },
  { name: 'blog-archive', path: '/blog/archive', h1: /archive/i },
  {
    name: 'blog-post',
    path: '/blog/2026-07-03-what-this-blog-is-for',
    h1: /what this blog is for/i,
  },
  { name: 'live', path: '/live', h1: /the live feed/i },
  { name: 'contact', path: '/contact', h1: /contact & volunteer/i },
  { name: 'contact-thanks', path: '/contact/thanks', h1: /your message is on its way/i },
  { name: 'about', path: '/about', h1: /resilient communications/i },
  { name: 'about-jay', path: '/about/jay', h1: /jay l\. goldberg/i },
  { name: 'about-corrinne', path: '/about/corrinne', h1: /corrinne goldberg/i },
  { name: 'about-allan', path: '/about/allan', h1: /allan claghorn/i },
  { name: 'about-dan', path: '/about/dan', h1: /dan pupius/i },
  { name: 'donate', path: '/donate', h1: /help keep the foothills connected/i },
  { name: 'colophon', path: '/colophon', h1: /how the signal desk works/i },
];

for (const pg of pages) {
  test(`${pg.name} renders core structure`, async ({ page }) => {
    await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
    // /live gates body + footer behind a loader until the first fetch settles into ready
    // (ok) or failed (feed unreachable) — wait for that before asserting on the footer.
    if (pg.path === '/live') {
      await page
        .waitForSelector('html[data-live-boot="ready"], html[data-live-boot="failed"]', {
          timeout: 12000,
        })
        .catch(() => {});
    }

    await expect(page).toHaveTitle(/S\.I\.E\.R\.R\.A/);
    // SEO: Google truncates titles over ~60 chars, and <title> == og:title (Seo.astro),
    // so this also guards the social-card title (issue #5).
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(pg.h1);

    await expect(page.locator('header nav[aria-label="Primary"]')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.locator('a.skip-link')).toHaveCount(1);

    // The full legal name must appear at least once (legal requirement).
    await expect(page.locator('body')).toContainText(
      'Signal Integrity & Emergency Radio Response Alliance'
    );
  });
}

test('404 page returns on-brand not-found content', async ({ page }) => {
  const res = await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' });
  // Static hosts serve 404.html; status may be 404 or 200 depending on host.
  expect(res).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/off the grid/i);
});
