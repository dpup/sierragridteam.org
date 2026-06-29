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
- [ ] **GitHub deploy secrets/variables.** Add **secrets** `AWS_ACCESS_KEY_ID`,
      `AWS_SECRET_ACCESS_KEY` and **variables** `AWS_REGION`, `AWS_ACCOUNT_ID`,
      `S3_BUCKET_NAME`, `CF_DISTRO_ID` (matches the `dpup/ersn.net` convention). Deploy
      then **auto-runs on merge** (after CI) and aborts if the account id doesn't match.
- [x] **Push to a remote** so CI/CD runs: `dpup/sierragridteam.org` (private).
- [ ] **Wire up the Donate destination.** The header/About **Donate** CTA and the
      `/donate` page are **placeholders** (`donate.isPlaceholder: true` in
      `src/config/site.ts`). Pick a provider (Donorbox / Stripe / Zeffy / etc.), point
      `donate.href` at it, replace the "Give online — coming soon" card copy in
      `src/config/content.ts`, and confirm the **tax-status language** once the
      501(c)(3) determination / EIN is final. See FR for the donation flow.

## Should-do

- [x] **info.ersn.net feature requests delivered + wired** (2026-06-26). FR-1 (CORS),
      FR-2 (NWS zone alerts), FR-3 (Red Flag fire-weather), FR-4 (Hwy 49 / Tuolumne
      towns), FR-7 (region-wide CHP/Caltrans incidents) all ship and are consumed live;
      placeholders removed. FR-5/FR-6 (the org's own mesh/relay status) remain. See
      `FEATURE_REQUESTS.md`.
- [x] **NWS forecast zones corrected.** The design's original list pulled a San-Diego-area
      alert (CAZ065); `NWS_ZONES` (in `src/lib/ersn.ts`) is now CAZ019 / CAZ067 / CAZ069 /
      CAZ072 (Tuolumne + foothills, lower Calaveras, Hwy 4 high country), verified to return
      only in-region alerts.
- [x] **Embeds decided.** Mesh map stays embedded (confirmed no X-Frame-Options). The
      CHP CAD iframe was removed in favor of native incident data via info.ersn.net (#7);
      CHP is now a resource link. Verify the mesh map renders once live.
- [x] **Data freshness — client refresh is live** (no scheduled rebuild). CORS (FR-1)
      shipped, so the browser refreshes the home tiles + /alerts every 5 min; SSR shows
      the build-time snapshot as the last-known value. `make snapshot` refreshes the
      committed baseline manually.
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

## Mesh page

- [ ] **Scope the embedded mesh map to our region.** `/mesh` currently embeds
      `livemap.wcmesh.com/bayarea/` (the **Bay Area** mesh). Investigate whether
      `https://map.wcmesh.com/` (or another wcmesh entrypoint) accepts region / bounds /
      channel URL parameters to show the **Calaveras & Tuolumne foothills**; if so, switch
      `externalLinks.liveMeshMap` in `src/config/site.ts`. It appears frameable (no obvious
      X-Frame-Options); the open question is the right parameters.

## Live Feed (situation page)

- [x] **`/live` flagship built** — MapLibre GL + CARTO Positron map, prioritized hazard
      stream, situation tiles, scanners, provenance; consumes the new info.ersn.net
      hazard/situation/scanner feeds. `/alerts` 301-redirects to `/live`.
- [x] **Site-wide emergency banner** (life-safety only: active evacuation or wildfire).
- [ ] **Confirm the server-side `calaveras` weather_alert zones.** The hazard
      `weather_alert` layer still returns an out-of-area zone (CAZ065 San Diego); we
      filter it out client/build-side to `NWS_ZONES`, but it should be fixed in
      info.ersn.net's `prefab.yaml` area config so the `/situation` rollup counts are
      right too.
- [ ] **Verify the Broadcastify scanner feed IDs** (`/scanners/calaveras`) point at the
      right Calaveras/CAL FIRE TCU channels before launch.
- [ ] **CARTO basemap** is the keyless free tier; if traffic grows, move to a
      self-hosted Protomaps PMTiles basemap (no third-party dependency) — one-line style
      swap in `src/lib/live-map.ts`.

## Verified already ✓

- All routes build statically (home, mesh, live, about, donate, contact, 404; /alerts
  → /live redirect); `make ci` green (types, stylelint, prettier, unit tests, build,
  Playwright a11y + smoke).
- WCAG 2.2 AA: zero critical/serious axe violations on every page.
- Deterministic screenshots at 3 viewports (`tests/screenshots/`), incl. a verified
  Red-Flag alarm state.
- SEO: per-page title/description/canonical, OG/Twitter, Organization/WebSite/
  ContactPage JSON-LD, sitemap, robots, favicons, web manifest.
- Design-system tokens + stylelint guardrails + per-directory `CLAUDE.md` so future
  edits stay on-system.
