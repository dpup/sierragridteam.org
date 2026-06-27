/**
 * Editable page copy. ALL human-readable text for the pages lives here so a
 * non-technical editor changes words, never layout or design. Keep the VOICE
 * institutional and calm (Elite · Pioneering · Trustworthy) — no hype, no neon.
 * See docs/content-style-guide.md (voice, terminology, honesty rules) and
 * src/config/CLAUDE.md before editing.
 */

export const home = {
  hero: {
    /** Two-tone headline: line 1 muted, line 2 near-black. Contrast carries the meaning. */
    headlineMuted: 'When the grid goes dark,',
    headlineStrong: 'the signal stays up.',
    subhead:
      'We build, operate, and train the volunteers behind an off-grid emergency communications network for the Calaveras & Tuolumne foothills.',
    primaryCta: { label: 'Open Live Map', href: '/mesh' },
    secondaryCta: { label: 'View the Live Feed', href: '/live' },
  },

  status: {
    kicker: 'Real-time Operational Status',
  },

  mission: {
    kicker: 'Mission',
    title: 'Resilience is built before the disaster.',
    body:
      'S.I.E.R.R.A is a volunteer non-profit that builds and operates off-grid emergency ' +
      'communication infrastructure across the Calaveras and Tuolumne foothills — and trains ' +
      'the people who keep it running. When wildfire, storm, or blackout takes the grid down, ' +
      'our LoRa mesh and amateur-radio network keeps neighbors, first responders, and ' +
      'emergency managers connected.',
  },

  doctrine: {
    kicker: 'Operational Doctrine',
    title: 'Educate, build, operate.',
    cards: [
      {
        number: '01',
        kicker: 'Educate',
        title: 'Train before the emergency.',
        body:
          'We run workshops and field exercises so residents, ham operators, and agency staff ' +
          'know how to use the network when it matters — not for the first time during a disaster.',
      },
      {
        number: '02',
        kicker: 'Build',
        title: 'Infrastructure that outlasts the grid.',
        body:
          'We deploy and maintain solar-powered LoRa relays and repeater sites along the ' +
          'Highway 4 and Highway 49 corridors, engineered to keep passing messages when power ' +
          'and cell service are gone.',
      },
      {
        number: '03',
        kicker: 'Operate',
        title: 'A standing capability, not an afterthought.',
        body:
          'Trained volunteers monitor conditions, relay traffic, and coordinate with fire ' +
          'districts and county emergency management — so the communications backbone is ready ' +
          'the moment it is needed.',
      },
    ],
  },
} as const;

export const mesh = {
  title: 'Mesh Network',
  kicker: 'LoRa · MeshCore',
  intro:
    'A live view of the S.I.E.R.R.A mesh — solar-powered LoRa relays that pass text and ' +
    'telemetry across the foothills when power and cellular service are down. This map is the ' +
    'authoritative live view; the homepage map is an identity visual only.',
  openMapLabel: 'Open Full Map',
  mapEmbedTitle: 'S.I.E.R.R.A live mesh coverage map',
  specsHeading: 'Technical specifications',
  specs: [
    { label: 'Protocol', value: 'LoRa · MeshCore' },
    { label: 'Band', value: '915 MHz (US ISM)' },
    { label: 'Topology', value: 'Self-healing mesh' },
    { label: 'Power', value: 'Solar + battery relays' },
    { label: 'Reach', value: 'Ridge-to-ridge, line of sight' },
  ],
  zonesHeading: 'Deployment zones',
  securityHeading: 'Security & privacy',
  security:
    'Operational channels are encrypted. The public map shows approximate coverage only — never ' +
    'exact node coordinates, site access, or operator identities.',
} as const;

export const alerts = {
  title: 'Emergency Alerts',
  kicker: 'Calaveras & Tuolumne',
  intro:
    'Current conditions, weather alerts, road status, and CHP / Caltrans incidents for the ' +
    'Highway 4 and Highway 49 corridors, drawn live from the info.ersn.net feed. ' +
    'Auto-refreshes every 5 minutes.',
  conditionsHeading: 'Current conditions',
  feedHeading: 'Active weather alerts',
  feedNote:
    'Alerts for the service-area NWS forecast zones (CAZ019 / CAZ067 / CAZ069 / CAZ072), ' +
    'from the National Weather Service and OpenWeatherMap.',
  roadsHeading: 'Road conditions',
  incidentsHeading: 'CHP & Caltrans incidents',
  incidentsNote:
    'Active California Highway Patrol and Caltrans dispatch incidents. Those inside the ' +
    'Calaveras & Tuolumne service area are listed first; the wider Mother Lode region is ' +
    'grouped below.',
  resourcesHeading: 'Additional resources',
  emptyState: 'No active weather alerts for the service area right now.',
  staleNote:
    'Showing last-known values — the live info.ersn.net feed was unreachable at build time. ' +
    'Conditions below may be out of date.',
} as const;

/** The Live Feed (situation) page — the public flagship during an emergency. */
export const live = {
  title: 'Live Feed',
  kicker: 'Calaveras County · Situation',
  heading: 'The Live Feed',
  intro:
    'One page for an unfolding emergency — official wildfire, evacuation, weather, seismic, ' +
    'and road feeds for the foothills on a single map with a prioritized alert stream. Built ' +
    'to answer one question fast: is my area safe right now?',
  autoRefresh: 'Auto-refreshes every 90 seconds',
  mapHeading: 'Live hazard map',
  streamHeading: 'Active alerts',
  streamEmpty: 'No active hazards in the service area right now. The map and feeds below are live.',
  conditionsHeading: 'Current conditions',
  roadsHeading: 'Road conditions',
  evacHeading: 'Evacuation zones & orders',
  evacNote:
    'Evacuation zones for Calaveras & Tuolumne are published by Cal OES. During an active ' +
    'event this is the authoritative source — look up your address and follow official orders.',
  evacLinkLabel: 'Open the evacuation map (Genasys)',
  scannersHeading: 'Dispatch audio',
  scannersNote:
    'Live public-safety scanner feeds via Broadcastify. Link-out only — audio is not hosted ' +
    'or rebroadcast here.',
  worksHeading: 'How this feed works',
  worksBody:
    'Every layer comes from an official agency feed, aggregated and cached by info.ersn.net ' +
    '(refreshed about every 90 seconds) so your browser never hammers the agencies directly ' +
    'during a disaster. Nothing here is simulated — when a source is unavailable it says so, ' +
    'and an empty evacuation feed is never read as an all-clear.',
  /** Provenance — the official sources behind each layer. */
  sources: [
    { label: 'Fire perimeters', detail: 'NIFC / WFIGS interagency perimeters (ArcGIS)' },
    { label: 'Wildfire incidents', detail: 'CAL FIRE active incidents' },
    { label: 'Evacuations', detail: 'Cal OES / Genasys — presence only, link-out' },
    { label: 'Weather & fire weather', detail: 'National Weather Service' },
    { label: 'Seismic', detail: 'USGS earthquake feed' },
    { label: 'Road incidents', detail: 'CHP / Caltrans (QuickMap)' },
  ],
  resourcesHeading: 'Official sources',
  staleNote:
    'Showing last-known values — the live feed was unreachable at build time. The situation ' +
    'below may be out of date; check official sources during an active emergency.',
} as const;

/** Site-wide emergency banner copy. One CTA only — it takes you to the Live Feed,
 *  where the official evacuation-map links live. */
export const emergencyBanner = {
  feedLabel: 'View the Live Feed',
} as const;

export const contact = {
  title: 'Contact & Volunteer',
  kicker: 'Join the Alliance',
  intro:
    'S.I.E.R.R.A is built and run entirely by volunteers. Whether you hold a license, swing a ' +
    'wrench, or coordinate logistics, there is a role for you in keeping the foothills connected.',
  rolesHeading: 'Volunteer roles',
  roles: [
    {
      name: 'Amateur (Ham) Radio Operators',
      desc: 'Licensed operators to staff nets, relay traffic, and support agency communications.',
    },
    {
      name: 'LoRa / MeshCore Technicians',
      desc: 'Build, deploy, and maintain solar relay sites and configure mesh nodes.',
    },
    {
      name: 'Emergency Management Liaisons',
      desc: 'Coordinate with fire districts, county OES, and CERT teams before and during events.',
    },
    {
      name: 'Field & Site Volunteers',
      desc: 'Help with site surveys, antenna work, and seasonal maintenance across the corridors.',
    },
    {
      name: 'Education & Outreach',
      desc: 'Run workshops and help residents prepare for wildfire and extended outages.',
    },
  ],
  formHeading: 'Get in touch',
  formIntro:
    'Tell us how you would like to help and we will follow up. Fields marked optional can be left blank.',
} as const;

export const about = {
  kicker: 'About the Alliance',
  title: 'Resilient communications, built by neighbors.',
  intro:
    'S.I.E.R.R.A — the Signal Integrity & Emergency Radio Response Alliance — is an ' +
    'all-volunteer non-profit that builds, operates, and trains the people behind an off-grid ' +
    'emergency communications network for the Calaveras & Tuolumne foothills.',
  story: {
    kicker: 'Our story',
    title: 'Founded for the next emergency.',
    // PLACEHOLDER: replace with the real founding story (who, when, why).
    body:
      'Established in 2026 by a group of amateur-radio operators, emergency-management ' +
      'professionals, and foothill residents who had lived through one too many wildfire ' +
      'evacuations and multi-day power shut-offs. [Placeholder — expand with the real story of ' +
      'how the alliance came together and the events that prompted it.]',
  },
  // "What we do" reuses the homepage doctrine (Educate / Build / Operate).
  team: {
    kicker: 'Leadership',
    title: 'The volunteers behind the network.',
    note: 'Board members and lead operators are introduced here. [Placeholder bios — replace with real names, roles, and short bios.]',
    members: [
      { name: '[Name]', role: 'Founder & Director', bio: '[Short bio coming soon.]' },
      { name: '[Name]', role: 'Network Operations Lead', bio: '[Short bio coming soon.]' },
      { name: '[Name]', role: 'Emergency Management Liaison', bio: '[Short bio coming soon.]' },
      { name: '[Name]', role: 'Training & Outreach', bio: '[Short bio coming soon.]' },
    ],
  },
  cta: {
    title: 'Help keep the signal up.',
    body: 'It takes volunteers and funding to keep solar relays on the air and operators trained.',
  },
} as const;

export const donate = {
  kicker: 'Support the mission',
  title: 'Help keep the foothills connected.',
  intro:
    'S.I.E.R.R.A is an all-volunteer non-profit. Your support funds the solar-powered relays, ' +
    'radios, and training that keep neighbors and first responders connected when the grid and ' +
    'cell service are down.',
  waysHeading: 'Ways to give',
  ways: [
    {
      name: 'Give online',
      // PLACEHOLDER: wire up a donation provider (Donorbox / Stripe / PayPal Giving / Givebutter).
      desc: 'Online giving is being set up. [Placeholder — connect your donation platform here.]',
      status: 'pending',
    },
    {
      name: 'By mail',
      desc: 'Mail a check payable to the Signal Integrity & Emergency Radio Response Alliance, P.O. Box 2071, Murphys, CA 95247.',
      status: 'live',
    },
    {
      name: 'Equipment & in-kind',
      desc: 'Radios, solar gear, antennas, and ridge-top tower space help as much as cash. Reach out via the contact page.',
      status: 'live',
    },
  ],
  // PLACEHOLDER: confirm before launch.
  taxNote:
    'S.I.E.R.R.A’s tax-exempt status and the deductibility of gifts are being finalized. ' +
    '[Placeholder — confirm 501(c)(3) status and add the EIN / official language before launch.]',
} as const;
