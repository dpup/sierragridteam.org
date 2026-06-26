# Feature Requests & Data Gaps

The site uses [info.ersn.net](https://info.ersn.net) as its live data feed. Where the
feed can't yet provide something the design calls for, the UI shows an **honest
placeholder** (never a fabricated value) and the gap is tracked here. See
`docs/architecture/data-feed.md` for the full integration design.

## Filed against `dpup/info.ersn.net`

| #    | Gap                                                                                 | Issue                                                | UI behavior today                                                                                                            |
| ---- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | No CORS `Access-Control-Allow-Origin` → browser refresh blocked                     | [#3](https://github.com/dpup/info.ersn.net/issues/3) | SSR build-time snapshot; client refresh silently no-ops on CORS failure (no error shown). Upgrades automatically when fixed. |
| FR-2 | No NWS zone alerts (CAZ064/065/258/259)                                             | [#4](https://github.com/dpup/info.ersn.net/issues/4) | Shows the regional weather feed + a visible "NWS-zone integration pending" note on /alerts.                                  |
| FR-3 | No fire-weather Red Flag classification                                             | [#5](https://github.com/dpup/info.ersn.net/issues/5) | "Fire Weather" tile shows a conservative "Normal" + footnote; never reports an unconfirmed Red Flag.                         |
| FR-4 | Hwy 49 / Tuolumne towns absent (Sonora, Columbia, Twain Harte, Dorrington)          | [#6](https://github.com/dpup/info.ersn.net/issues/6) | Those towns render as coverage markers / zones without live data, labeled as such.                                           |
| FR-7 | No region-wide CHP/CAD dispatch incident feed (only per-monitored-road in `/roads`) | [#7](https://github.com/dpup/info.ersn.net/issues/7) | `/alerts` shows per-road incidents + a "live feed pending" note; CHP CAD linked under Resources.                             |

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
