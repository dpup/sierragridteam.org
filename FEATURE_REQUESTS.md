# Feature Requests & Data Gaps

The site uses [info.ersn.net](https://info.ersn.net) as its live data feed. Where the
feed can't yet provide something the design calls for, the UI shows an **honest
placeholder** (never a fabricated value) and the gap is tracked here. See
`docs/architecture/data-feed.md` for the full integration design.

## ✅ Delivered by `dpup/info.ersn.net` (wired up 2026-06-26)

These shipped and are now consumed live — placeholders removed.

| #    | Gap                                                                        | Issue                                                | Now wired to                                                                                                                       |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | No CORS `Access-Control-Allow-Origin` → browser refresh blocked            | [#3](https://github.com/dpup/info.ersn.net/issues/3) | CORS now allows `sierragridteam.org` + `localhost:4321`; the home + /alerts islands refresh live every 5 min (SSR fallback stays). |
| FR-2 | No NWS zone alerts                                                         | [#4](https://github.com/dpup/info.ersn.net/issues/4) | `GET /weather/alerts?zones=CAZ019,067,069,072` → AlertsFeed + the home "Active Alerts" tile (`NWS_ZONES` in `src/lib/ersn.ts`).    |
| FR-3 | No fire-weather Red Flag classification                                    | [#5](https://github.com/dpup/info.ersn.net/issues/5) | `weather.fireWeather.state` (NORMAL/ELEVATED/RED_FLAG) → "Fire Weather" tile via `deriveFireWeather`. Still never fabricates.      |
| FR-4 | Hwy 49 / Tuolumne towns absent (Sonora, Columbia, Twain Harte, Dorrington) | [#6](https://github.com/dpup/info.ersn.net/issues/6) | `/weather` covers 7 towns + `/roads` adds the Hwy 49 corridor → the new Current-conditions strip on /alerts.                       |
| FR-7 | No region-wide CHP/CAD dispatch incident feed                              | [#7](https://github.com/dpup/info.ersn.net/issues/7) | `GET /incidents/mother-lode` → the "CHP & Caltrans incidents" section, split service-area-first via `splitIncidents`.              |

> ✅ **NWS zones corrected (2026-06-26):** the design's original list surfaced a
> San-Diego-area alert (CAZ065). `NWS_ZONES` is now CAZ019 / CAZ067 / CAZ069 / CAZ072
> (Tuolumne + Mother Lode foothills, lower Calaveras, and the Hwy 4 Alpine/high-Sierra
> country) — verified to no longer return out-of-area alerts.

## Tracked locally (out of info.ersn.net's roads/weather domain)

These concern S.I.E.R.R.A's own mesh/relay infrastructure, not Ebbett's Pass
roads/weather, so they aren't filed on `info.ersn.net`. They need a relay/mesh status
source (or a small status endpoint the org hosts itself).

| #    | Gap                                          | UI behavior today                                                                        |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR-5 | No per-relay-site status (up/down/last-seen) | "Relay Sites" tile + /mesh zones use owned static config in `src/config/coverage.ts`.    |
| FR-6 | No structured mesh-node feed (counts/health) | /mesh lists deployment zones statically; the authoritative live map is the wcmesh embed. |

When any of these lands, remove the corresponding placeholder and wire the real value
— see the components noted in `docs/architecture/data-feed.md`.
