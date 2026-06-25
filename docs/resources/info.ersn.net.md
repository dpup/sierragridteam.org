info.ersn.net

Real-time API server providing road conditions and weather information
for the Ebbett's Pass region.

Repository:
https://github.com/dpup/info.ersn.net

Website:
https://ersn.net

API Endpoints:

Roads API:
GET /api/v1/roads - List all monitored roads
GET /api/v1/roads/{road_id} - Get specific road details

Weather API:
GET /api/v1/weather - Current weather for all locations
GET /api/v1/weather/alerts - Active weather alerts

API Documentation:
Roads API OpenAPI Spec - Machine-readable API docs (Roads)
Weather API OpenAPI Spec - Machine-readable API docs (Weather)

Data Sources:
• Google Routes API - Traffic conditions and travel times
• Caltrans KML Feeds - Lane closures and CHP incidents
• OpenWeatherMap API - Weather data and alerts

Example Usage:
curl https://info.ersn.net/api/v1/roads
curl https://info.ersn.net/api/v1/weather
