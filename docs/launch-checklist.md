# Launch Checklist — sierragridteam.org

The site is build-complete and CI-green. These are the remaining steps to go live.
Most are external/account actions that can't be done from the codebase.

## Must-do before launch

- [x] **Contact email set live** (`info@sierragridteam.org`, `emailIsPlaceholder:
false`); overridable via `PUBLIC_CONTACT_EMAIL`. Confirm the inbox is monitored.
- [x] **P.O. Box ZIP corrected to 95247** (the brief's 95427 was a digit
      transposition); updated in `src/config/site.ts`.
- [ ] **AWS infra (Terraform, separate project).** Provision the S3 bucket +
      CloudFront (OAC, 403/404 → `/404.html`, ACM cert) and a deploy IAM user, then
      add the Hostinger DNS records. See `docs/deployment.md`.
- [ ] **GitHub deploy secrets.** Add as **secrets**: `AWS_ACCESS_KEY_ID`,
      `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ACCOUNT_ID`, `S3_BUCKET`,
      `CLOUDFRONT_DISTRIBUTION_ID`. Deploy then **auto-runs on merge** (after CI) and
      aborts if the account id doesn't match.
- [ ] **Push to a remote** (currently local-only) so CI/CD runs. When ready:
      `gh repo create dpup/sierragridteam --private --source . --remote origin --push`

## Should-do

- [x] **info.ersn.net feature requests filed** ([#3–#7](https://github.com/dpup/info.ersn.net/issues));
      #3 (CORS) is the unblocker for the live client refresh. See `FEATURE_REQUESTS.md`.
- [x] **Embeds decided.** Mesh map stays embedded (confirmed no X-Frame-Options). The
      CHP CAD iframe was removed in favor of native incident data via info.ersn.net (#7);
      CHP is now a resource link. Verify the mesh map renders once live.
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
