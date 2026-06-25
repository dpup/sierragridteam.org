// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The canonical production origin. DNS is managed via Hostinger; the static
// output is deployed to AWS S3 + CloudFront. See docs/deployment.md.
const SITE = 'https://sierragridteam.org';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Fully static output — no server adapter. Every page is pre-rendered to HTML
  // at build time (with a baked-in info.ersn.net snapshot); small islands hydrate
  // client-side for the live clock and data refresh. See docs/architecture/data-feed.md.
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Emit clean URLs: /mesh -> mesh.html, served as /mesh by CloudFront.
    format: 'file',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      // Keep the sitemap honest: only real, indexable pages.
      filter: (page) => !page.includes('/404'),
    }),
  ],
  // Deterministic, dependency-light builds: no telemetry, predictable asset names.
  devToolbar: { enabled: false },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
