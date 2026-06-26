/**
 * Editable page copy. ALL human-readable text for the pages lives here so a
 * non-technical editor changes words, never layout or design. Keep the VOICE
 * institutional and calm (Elite · Pioneering · Trustworthy) — no hype, no neon.
 * See src/config/CLAUDE.md before editing.
 */

export const home = {
  hero: {
    /** Two-tone headline: line 1 muted, line 2 near-black. Contrast carries the meaning. */
    headlineMuted: 'When the grid goes dark,',
    headlineStrong: 'the signal stays up.',
    subhead:
      'We build, operate, and train the volunteers behind an off-grid emergency communications network for the Calaveras & Tuolumne foothills.',
    primaryCta: { label: 'Open Live Map', href: '/mesh' },
    secondaryCta: { label: 'View Emergency Alerts', href: '/alerts' },
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
    'Current weather, fire-weather, and road conditions for the Highway 4 and Highway 49 ' +
    'corridors, drawn from the info.ersn.net feed. Auto-refreshes every 5 minutes.',
  feedHeading: 'Active alerts',
  roadsHeading: 'Road conditions',
  chpHeading: 'CHP dispatch (Mother Lode)',
  chpNote:
    'Region-wide CHP dispatch incidents will appear here once available as a structured feed ' +
    'from info.ersn.net (tracked as #7). Incidents on the monitored Highway 4 corridor already ' +
    'show under Road conditions above; the full CHP CAD dashboard is linked under Resources.',
  resourcesHeading: 'Additional resources',
  emptyState: 'No active weather alerts for the service area right now.',
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
