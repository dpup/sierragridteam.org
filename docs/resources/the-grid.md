The Grid — the S.I.E.R.R.A data service

Real-time API server providing wildfire, evacuation, weather, seismic, and road
conditions for the Ebbetts Pass Corridor (Calaveras + Tuolumne, along Hwy 4 + Hwy 49).

Primary host:
https://data.sierragridteam.org
(Formerly info.ersn.net, which remains a supported CNAME alias through the transition;
ersn.net is now a consuming site, "powered by S.I.E.R.R.A".)

Repository:
https://github.com/dpup/sierra-data
(Renamed 2026-07-06 from github.com/dpup/info.ersn.net/server — internal identity only,
no effect on the HTTP API.)

API Endpoints (the legacy `/api/v1` surface this site consumes — camelCase fields):

Roads API:
GET /api/v1/roads - List all monitored roads (now includes a `polyline` per road)
GET /api/v1/roads/{road_id} - Get specific road details

Weather API:
GET /api/v1/weather - Current weather for all locations
GET /api/v1/weather/alerts - Active NWS weather alerts (?zones=CAZ019,… to filter)

Hazards / situation (map-ready GeoJSON + rollup):
GET /api/v1/hazards/{area}/{layer}.geojson - one layer as RFC 7946 GeoJSON
GET /api/v1/situation/{area} - one-call dashboard rollup
GET /api/v1/scanners/{area} - Broadcastify scanner feeds (link-out only)
where {area} is the coverage-area slug — `ebbetts-pass` (renamed 2026-07-06
from `calaveras`; the old slug now 404s).

A newer first-principles `/v1` surface (snake_case, a persistent event store, a place
directory) also exists; this site still consumes `/api/v1`. See the service's own
CHANGELOG and `/docs.html`.

Data Sources:
• Google Routes API - Traffic conditions and travel times
• Caltrans / CHP KML feeds - Lane closures and dispatch incidents
• NWS - Weather alerts + fire-weather classification
• OpenWeatherMap API - Current weather conditions
• USGS, CAL FIRE, NIFC/WFIGS, Cal OES - Seismic, wildfire, and evacuation data

Example Usage:
curl https://data.sierragridteam.org/api/v1/roads
curl https://data.sierragridteam.org/api/v1/weather
