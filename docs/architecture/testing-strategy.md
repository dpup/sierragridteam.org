# Testing & CI/CD Strategy — sierragridteam.org

Even though the site is static, we treat it like production software: typed, linted, tested,
screenshotted, and deployed by pipeline.

## Layers

### 1. Static analysis (fast, every commit)
- `astro check` — TypeScript + Astro template type-checking.
- `eslint` — JS/TS correctness + a11y rules.
- `stylelint` — **design-guardrail linting**: bans raw hex colors and raw px font-sizes in
  component/page styles (must use tokens); enforces the no-shadow / square-corner conventions
  where lintable. See `.stylelintrc` + `docs/architecture/design-tokens.md`.
- `prettier --check` — formatting.

### 2. Data-layer unit tests (`bun test`)
- `src/lib/ersn.test.ts` — parse/normalize the real captured fixtures
  (`src/data/__fixtures__/*.json`); unit conversions (°C→°F etc.); graceful fallback when the
  fetch throws (returns the snapshot, never throws to the page).

### 3. Build verification
- `astro build` must succeed offline (uses checked-in snapshot fallback) and produce `dist/`.
- Link-check internal links; assert `sitemap-index.xml`, `robots.txt`, og image exist.

### 4. Deterministic screenshots (Playwright)
The flagship visual tool. **Determinism is enforced so screenshots are diffable and analyzable:**
- Fixed viewports: `desktop` 1440×900, `tablet` 834×1112, `mobile` 390×844.
- **Freeze time** — inject a fixed `Date`/clock so the live clock + "Synced" stamp are constant.
- **Mock the data feed** — Playwright intercepts `info.ersn.net` requests and serves fixed
  fixtures (incl. a Red-Flag scenario + an active-alert scenario) so states are reproducible.
- **Disable animations** — `prefers-reduced-motion` + CSS `* { animation: none !important }`.
- Capture full-page PNGs per page per viewport into `tests/screenshots/`.
- `scripts/screenshots.ts` (or `make screenshots`) runs them headless and deterministically.

These PNGs are then **read and analyzed** (by a human or an agent) for visual glitches,
overflow, contrast, alignment, and design-system conformance (Phase 8). Optionally
`expect(page).toHaveScreenshot()` baselines guard against regressions.

### 5. Accessibility tests
- `@axe-core/playwright` on every page/viewport — zero critical/serious violations = gate.

## CI/CD (GitHub Actions — runs even though git is local-only, ready when a remote is added)
`.github/workflows/ci.yml`:
1. checkout → setup bun → `bun install`
2. `make check` (astro check + eslint + stylelint + prettier)
3. `bun test`
4. `make build`
5. `make test-visual` (Playwright: screenshots + axe) — uploads screenshots as artifacts.

`.github/workflows/deploy.yml` (**AWS S3 + CloudFront**, DNS via Hostinger):
- On push to `main` after CI passes: `make build` → `aws s3 sync dist/ s3://$BUCKET --delete`
  → `aws cloudfront create-invalidation --paths "/*"`.
- Credentials as repo **secrets**: `AWS_ROLE_ARN` (OIDC preferred) / `AWS_ACCESS_KEY_ID` +
  `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`. Documented in
  `docs/deployment.md`. Workflow is a ready template — no secrets are committed.

## Make targets (developer + CI entrypoints)
`dev`, `build`, `preview`, `check`, `lint`, `fmt`, `test`, `screenshots`, `test-visual`,
`snapshot` (refresh data snapshot), `gen-assets` (favicons/og), `ci` (everything).
