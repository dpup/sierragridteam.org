S.I.E.R.R.A Website starting framework (starting point) 4 fully independent, polished pages:

🏠 Home Page (`/`)

- Full-screen hero with SIERRA **logo in a glass-morphism badge** with cyan glow
- Animated mission statement and organization description
- Real-time operational status bar (network status, county coverage, alert monitoring)
- Two CTA buttons → Mesh Network + Emergency Alerts
- Mission section with capability grid
- "Explore Our Capabilities" 3-card section with live tags
- Service area footer banner

### 📡 MESH / LoRa (`/mesh`) — **First nav item**

- Full-page embedded live map from **https://livemap.wcmesh.com/bayarea/**
- Loading screen while map initializes
- Collapsible info sidebar with tech specs, S.I.E.R.R.A. deployment zones (Murphys, Angels Camp, Sonora, etc.), security info
- External "Open Full Map" link

### 🚨 ALERTS (`/alerts`)

- **Live NWS weather alerts** fetched from `api.weather.gov` for zones **CAZ064, CAZ065, CAZ258, CAZ259** (Calaveras & Tuolumne mountains + foothills)
- Color-coded severity (Extreme=Red, Severe=Orange, Moderate=Yellow, Minor=Blue)
- Expandable alert cards with full details
- Auto-refreshes every 5 minutes
- **Embedded CHP CAD dispatch dashboard** (cad.chp.ca.gov) with browser chrome UI
- County quick-links (Angels Camp + Sonora/Mother Lode areas)
- Additional resources: NWS Sacramento, CAL FIRE, USGS Earthquakes

### 📬 Contact (`/contact`)

- Your address: **P.O. Box 2071, Murphys, CA 95427**
- Volunteer roles listing (Ham operators, LoRa techs, emergency management, etc.)
- Contact form with optional Ham call sign field
- Emergency 911 disclaimer notice
- Opens email client via mailto
