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
- [ ] **Wire up the Donate destination.** The header/About **Donate** CTA and the
      `/donate` page are **placeholders** (`donate.isPlaceholder: true` in
      `src/config/site.ts`). Pick a provider (Donorbox / Stripe / Zeffy / etc.), point
      `donate.href` at it, replace the "Give online — coming soon" card copy in
      `src/config/content.ts`, and confirm the **tax-status language** once the
      501(c)(3) determination / EIN is final. See FR for the donation flow.

## Should-do

- [x] **info.ersn.net feature requests filed** ([#3–#7](https://github.com/dpup/info.ersn.net/issues));
      #3 (CORS) is the unblocker for the live client refresh. See `FEATURE_REQUESTS.md`.
- [x] **Embeds decided.** Mesh map stays embedded (confirmed no X-Frame-Options). The
      CHP CAD iframe was removed in favor of native incident data via info.ersn.net (#7);
      CHP is now a resource link. Verify the mesh map renders once live.
- [x] **Data freshness — relying on client refresh** (no scheduled rebuild). Once CORS
      (#3) lands the browser refreshes live every 5 min; until then data is
      as-of-last-deploy. `make snapshot` refreshes the committed baseline manually.
- [x] **Dynamic per-page OG cards** built (satori + resvg) at `/og/<slug>.png` — on-brand
      (mark, serif title, brass kicker, network motif); tags complete. Validate the live
      unfurl with a sharing debugger once the domain is up.

- [ ] **Fill in the About page placeholders.** `src/config/content.ts` `about.*` has
      bracketed placeholders for the founding story (`about.story.body`) and the four
      `about.team.members` (`[Name]` / role / `[Short bio coming soon.]`). Replace with
      real leadership names/bios and the actual origin story before launch.

## Nice-to-have

- [x] **www → apex redirect** — handled in your Terraform/infra (apex is canonical
      site-wide; no repo change needed).
- [x] **Analytics — none** by choice; use CloudFront's server-side request metrics
      (no client script, cookieless, zero perf cost).
- [x] **Scheduled rebuild — declined** (relying on client refresh; see Data freshness).
- [ ] **After launch:** verify `sierragridteam.org` in Google Search Console and submit
      `https://sierragridteam.org/sitemap-index.xml` (DNS verification — nothing needed
      in the repo).

## Verified already ✓

- All 7 routes build statically (home, mesh, alerts, about, donate, contact, 404);
  `make ci` green (types, stylelint, prettier, unit tests, build, Playwright a11y +
  smoke).
- WCAG 2.2 AA: zero critical/serious axe violations on every page.
- Deterministic screenshots at 3 viewports (`tests/screenshots/`), incl. a verified
  Red-Flag alarm state.
- SEO: per-page title/description/canonical, OG/Twitter, Organization/WebSite/
  ContactPage JSON-LD, sitemap, robots, favicons, web manifest.
- Design-system tokens + stylelint guardrails + per-directory `CLAUDE.md` so future
  edits stay on-system.
