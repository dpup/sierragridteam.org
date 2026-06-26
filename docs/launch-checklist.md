# Launch Checklist — sierragridteam.org

The site is build-complete and CI-green. These are the remaining steps to go live.
Most are external/account actions that can't be done from the codebase.

## Must-do before launch

- [x] **Contact email set live** (`info@sierragridteam.org`, `emailIsPlaceholder:
    false`); overridable via `PUBLIC_CONTACT_EMAIL`. Confirm the inbox is monitored.
- [x] **P.O. Box ZIP corrected to 95247** (the brief's 95427 was a digit
      transposition); updated in `src/config/site.ts`.
- [ ] **AWS + Hostinger.** Create the S3 bucket + CloudFront distribution, map
      403/404 → `/404.html`, attach the ACM cert, and point Hostinger DNS at
      CloudFront. See `docs/deployment.md`.
- [ ] **GitHub deploy secrets.** Set `AWS_ROLE_ARN` (or access keys), `AWS_REGION`,
      `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID` so `deploy.yml` can run.
- [ ] **Push to a remote** (the repo is currently local-only) so CI/CD runs.

## Should-do

- [ ] **info.ersn.net feature requests.** Track [#3–#6](https://github.com/dpup/info.ersn.net/issues);
      when CORS (#3) lands, the live client refresh starts working with no code change.
      See `FEATURE_REQUESTS.md`.
- [ ] **Confirm external embeds load** in production: the mesh map
      (`livemap.wcmesh.com/bayarea/`) and CHP CAD (`cad.chp.ca.gov`). If either sends
      `X-Frame-Options: DENY`, it won't embed — the "Open Full Map" / "Open" links are
      the fallback. Decide whether to keep the embed or switch to a link card.
- [ ] **Refresh the data snapshot** at deploy time (`make snapshot` + commit, or a
      scheduled rebuild) so the SSR "last-known" values aren't stale.
- [ ] **Social/OG check.** Validate `og-default.png` and the Open Graph tags with a
      sharing debugger once the domain is live.

## Nice-to-have

- [ ] Add `www → apex` (or apex → www) redirect at CloudFront.
- [ ] Google Search Console + submit `sitemap-index.xml`.
- [ ] Analytics (privacy-respecting, e.g. Plausible) if desired.
- [ ] A scheduled GitHub Action to rebuild daily so the data snapshot stays fresh.

## Verified already ✓

- All 5 routes build statically; `make ci` green (types, stylelint, prettier, unit
  tests, build, Playwright a11y + smoke).
- WCAG 2.2 AA: zero critical/serious axe violations on every page.
- Deterministic screenshots at 3 viewports (`tests/screenshots/`), incl. a verified
  Red-Flag alarm state.
- SEO: per-page title/description/canonical, OG/Twitter, Organization/WebSite/
  ContactPage JSON-LD, sitemap, robots, favicons, web manifest.
- Design-system tokens + stylelint guardrails + per-directory `CLAUDE.md` so future
  edits stay on-system.
