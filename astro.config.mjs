// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S3 with Origin Access Control returns 403 (not 404) for a missing object, and
// CloudFront serves a status-matched error page. Ship /403.html next to /404.html —
// the same on-brand "off the grid" page — by copying it at build time (one source).
/** @type {import('astro').AstroIntegration} */
const emit403 = {
  name: 'emit-403',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const out = fileURLToPath(dir);
      copyFileSync(`${out}404.html`, `${out}403.html`);
    },
  },
};

// The canonical production origin. DNS is managed via Hostinger; the static
// output is deployed to AWS S3 + CloudFront. See docs/deployment.md.
const SITE = 'https://sierragridteam.org';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Fully static output — no server adapter. Every page is pre-rendered to HTML
  // at build time; small islands hydrate client-side for the live clock and live data
  // (fetched from data.sierragridteam.org in the browser — no feed data is baked in).
  // See docs/architecture/data-feed.md.
  output: 'static',
  trailingSlash: 'never',
  // /alerts was folded into the flagship /live situation page. Astro emits a static
  // redirect (meta-refresh + canonical); a true 301 can also be set at CloudFront.
  redirects: {
    '/alerts': '/live',
  },
  build: {
    // Directory output: /mesh -> mesh/index.html (Astro's default, matches the other
    // sites + standard S3/CloudFront hosting). A CloudFront viewer-request function maps
    // the clean URL /mesh -> /mesh/index.html — see docs/deployment.md.
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      // Keep the sitemap honest: only real, indexable pages.
      filter: (page) => !page.includes('/404'),
    }),
    emit403,
  ],
  // DEV-ONLY same-origin proxy to The Grid.
  //
  // The feed's CORS allowlist names the production origin and `http://localhost:4321`. Any
  // other dev origin — a container port mapping, a LAN IP, a tunnel/`--host` hostname — is
  // rejected by the browser before the response is read, so every live region on /live and
  // /mesh fails. Proxying through the dev server makes the requests same-origin, so CORS
  // stops applying at all and dev works from any hostname.
  //
  // This exists ONLY in `astro dev`. The production build and `astro preview` are untouched
  // and still hit https://data.sierragridteam.org directly — see GRID_API_BASE in
  // src/lib/grid.ts, which selects this path on `import.meta.env.DEV`. Nothing is fetched at
  // build time either way (docs/architecture/data-feed.md).
  vite: {
    server: {
      proxy: {
        '/grid-api': {
          target: 'https://data.sierragridteam.org',
          changeOrigin: true, // send the upstream's Host — needed for TLS SNI + vhost routing
          rewrite: (p) => p.replace(/^\/grid-api/, '/api/v1'),
        },
      },
    },
  },
  // Deterministic, dependency-light builds: no telemetry, predictable asset names.
  devToolbar: { enabled: false },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
