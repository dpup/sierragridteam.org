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
    primaryCta: { label: 'Open Mesh Map', href: '/mesh' },
    secondaryCta: { label: 'View the Live Feed', href: '/live' },
  },

  status: {
    kicker: 'Real-time Operational Status',
    syncing: 'Updating…',
  },

  mission: {
    kicker: 'Mission',
    title: 'Resilience is built before the disaster.',
    body:
      'S.I.E.R.R.A — the Signal Integrity & Emergency Radio Response Alliance — is a volunteer ' +
      'non-profit that builds and operates off-grid emergency communication infrastructure across ' +
      'the Calaveras and Tuolumne foothills, and trains the people who keep it running. When ' +
      'wildfire, storm, or blackout takes the grid down, our LoRa mesh and amateur-radio network ' +
      'keeps neighbors, first responders, and emergency managers connected.',
  },

  doctrine: {
    kicker: 'Operational Doctrine',
    title: 'How the network stays ready.',
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
} as const;

/** The Live Feed (situation) page — the public flagship during an emergency. */
export const live = {
  title: 'Live Feed',
  kicker: 'Calaveras & Tuolumne · Situation',
  heading: 'The Live Feed',
  loading: 'Loading the latest situation…',
  intro:
    'Official wildfire, evacuation, weather, seismic, and road feeds for the Calaveras & ' +
    'Tuolumne foothills, gathered onto one map with the most urgent first. When something is ' +
    'unfolding, start here to check whether your area is safe.',
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
  resourcesHeading: 'Official sources',
  failHeading: 'Live feed unavailable',
  failBody:
    "We couldn't reach the data feeds right now. Rather than show stale information, here are " +
    'the official sources — check them directly for current conditions.',
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
  formPrivacyNote:
    'This form sends your message straight to our inbox. We do not share it with anyone else.',
  formErrorNote:
    'Something went wrong sending your message. Please email us directly — the address is below the form.',
  thanks: {
    kicker: 'Message Sent',
    title: 'Thank you — your message is on its way.',
    body:
      'A volunteer reads every message, and we will reply to the email address you provided. ' +
      'If your note is time-sensitive, email us directly at',
  },
} as const;

export const blog = {
  kicker: 'News & Notes',
  title: 'Notes from the foothills.',
  intro:
    'Technology, preparedness, and lessons in emergency communications — written slowly, ' +
    'when there is something worth saying. For anything happening right now, the Live Feed ' +
    'is the place.',
  /** How many full posts the main /blog page shows before pointing at the archive. */
  recentCount: 5,
  archiveLink: 'Browse the Archive',
  emptyNote: 'No posts yet — the first ones are on their way.',
  archive: {
    kicker: 'News & Notes',
    title: 'The archive.',
    intro: 'Every post, by year and month.',
    backLink: 'Latest Posts',
  },
  post: {
    backLink: 'All Posts',
  },
} as const;

/** /colophon — how the automated news desk works (linked from every desk post). */
export const colophon = {
  kicker: 'Colophon',
  title: 'How the Signal Desk works.',
  deskName: 'Signal Desk',
  sections: [
    {
      heading: 'What it is',
      body:
        'Posts on the blog bylined "Signal Desk" are drafted by an automated editorial ' +
        'system — an AI model with web-search access, operating under a published editorial ' +
        'brief that sets its scope, sourcing standards, and hard rules. It runs on a ' +
        'schedule, and most runs publish nothing: silence is the intended output unless ' +
        'there is something genuinely worth a reader’s time.',
    },
    {
      heading: 'Human review',
      body:
        'Every draft is submitted for review and approved by a member of S.I.E.R.R.A before ' +
        'it appears on the site. Nothing the desk writes publishes on its own.',
    },
    {
      heading: 'Sourcing',
      body:
        'Every factual claim in a desk post links to a source — official agencies for ' +
        'conditions and incidents, project pages and release notes for technology. The desk ' +
        'never covers unfolding emergencies (that is the Live Feed’s job), never issues ' +
        'emergency instructions, and never reports on S.I.E.R.R.A’s own network or ' +
        'operations — members publish that news themselves.',
    },
    {
      heading: 'Corrections',
      body:
        'Spotted an error? Email us — the address is on the contact page — and we will ' +
        'correct the post and note the change.',
    },
  ],
  briefNote: 'The full editorial brief is public in the site’s repository:',
  briefUrl: 'https://github.com/dpup/sierragridteam.org/blob/main/docs/news-feed-content-brief.md',
  briefLabel: 'News-feed content brief (GitHub)',
} as const;

export const about = {
  kicker: 'About the Alliance',
  title: 'Resilient communications, built by neighbors.',
  intro:
    'S.I.E.R.R.A — the Signal Integrity & Emergency Radio Response Alliance — is an ' +
    'all-volunteer non-profit that builds, operates, and trains the people behind an off-grid ' +
    'emergency communications network for the Calaveras & Tuolumne foothills.',
  story: {
    kicker: 'Our Story',
    title: 'Founded for the next emergency.',
    body:
      'S.I.E.R.R.A grew out of the Ebbett’s Pass Radio Safety Network, the volunteer radio ' +
      'service founder Jay Goldberg operates along the Highway 4 corridor. When a GMRS ' +
      'repeater he built proved vital to the rescues of multiple people in a major 2026 ' +
      'snowstorm, the case for something larger was clear — an off-grid hub coordinating ' +
      'emergency communications between public safety agencies and residents. Established in ' +
      '2026 as an all-volunteer non-profit, the alliance brings together radio operators, ' +
      'public-safety veterans, and engineers to build that network for the Calaveras & ' +
      'Tuolumne foothills — and to train the people who keep it running.',
  },
  // "What we do" reuses the homepage doctrine (Educate / Build / Operate).
  // The people themselves (names, roles, bios, photos) live in src/config/people.ts.
  team: {
    kicker: 'Leadership',
    title: 'The volunteers behind the network.',
    note: 'S.I.E.R.R.A is governed by a volunteer board of directors, supported by technical advisors.',
    boardHeading: 'Board of Directors',
    advisorsHeading: 'Advisors',
  },
  cta: {
    title: 'Help keep the signal up.',
    body: 'It takes volunteers and funding to keep solar relays on the air and operators trained.',
  },
  // Per-person profile pages at /about/<slug> (people live in src/config/people.ts).
  profile: {
    backLabel: 'About S.I.E.R.R.A',
    ctaNote: 'S.I.E.R.R.A is built and run entirely by volunteers.',
    ctaTeam: 'Meet the Full Team',
    ctaVolunteer: 'Volunteer',
  },
} as const;

export const donate = {
  kicker: 'Support the Mission',
  title: 'Help keep the foothills connected.',
  intro:
    'S.I.E.R.R.A is an all-volunteer non-profit. Your support funds the solar-powered relays, ' +
    'radios, and training that keep neighbors and first responders connected when the grid and ' +
    'cell service are down.',
  waysHeading: 'Ways to give',
  ways: [
    {
      name: 'Give Online',
      // TODO(pre-launch): wire up a donation provider (Donorbox / Stripe / PayPal Giving /
      // Givebutter), then set status to 'live' and describe it here.
      desc: 'Online giving is being set up and will appear here soon. In the meantime, gifts by mail and equipment donations are just as welcome.',
      status: 'pending',
    },
    {
      name: 'By Mail',
      desc: 'Mail a check payable to the Signal Integrity & Emergency Radio Response Alliance, P.O. Box 2071, Murphys, CA 95247.',
      status: 'live',
    },
    {
      name: 'Equipment & In-Kind',
      desc: 'Radios, solar gear, antennas, and ridge-top tower space help as much as cash. Reach out via the contact page.',
      status: 'live',
    },
  ],
  // TODO(pre-launch): once 501(c)(3) status is confirmed, replace with the official
  // language + EIN. Until then this stays honest: no deductibility is claimed.
  taxNote:
    'S.I.E.R.R.A’s tax-exempt status and the deductibility of gifts are being finalized. ' +
    'Official confirmation and receipt details will be posted here once complete.',
} as const;
