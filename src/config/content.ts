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

/**
 * The Mesh page — the live topology map. Every count on this page comes from The Grid's
 * MeshCore feed; the copy must stay inside what an advert can actually prove (we observed
 * these two repeaters relay for each other, this often, this recently) and must never
 * upgrade that into a coverage or reliability claim — see docs/content-style-guide.md §10
 * and the "what the map does not say" note below, which is load-bearing, not decoration.
 */
export const mesh = {
  title: 'Mesh Network',
  kicker: 'LoRa · MeshCore',
  heading: 'The Mesh',
  loading: 'Loading the mesh…',
  autoRefresh: 'Auto-refreshes every 2 minutes',
  mapTitle: 'S.I.E.R.R.A mesh topology map',
  mapFallback:
    'The mesh map needs JavaScript and WebGL. Every corridor repeater is also listed beside ' +
    'the map.',
  mapPanelTitle: 'Observed topology · Ebbetts Pass',
  legendCorridor: 'Corridor repeater',
  legendNeighbour: 'Neighbour',
  aboutLink: 'What this map does and does not say',

  // ---- The history band. The chart compares repeaters against each other; the roster's
  // bar and sparkline answer "how is this one doing". Keep the copy about comparison.
  historyLabel: 'History',
  historyHint: 'All monitored repeaters — hover a trace to name it, click to isolate it',
  historyHintSelected: 'One repeater isolated — click it again to compare all',
  historyEmpty:
    'No repeater in the corridor is reporting monitor telemetry yet, so there is no history ' +
    'to draw. That is a gap in what we watch, not a reading from the network.',
  historyNoRange:
    'No readings were retained inside this range. Try a shorter one — the archive begins at ' +
    'the first accepted report, and there is no backfill before it.',
  historyNoDataBefore: 'No data retained before',
  historyTruncated:
    'This range holds more samples than one response carries, so at least one trace is cut ' +
    'short — narrow the range to see all of it.',
  attentionLabel: 'Needs attention',
  rosterHeading: 'Corridor repeaters',
  // "Not monitored" read as an accusation — nobody is watching this site. What is actually
  // true is narrower: we hear the repeater on the mesh, we just have no site telemetry from
  // it. "Limited Telemetry" says that without implying neglect or a fault.
  notMonitored: 'Limited Telemetry',
  healthUnreadable: 'Gauge unread',
  healthUnreadableNote: 'Monitor reached it, gauge unread',
  healthUnknownSub: 'Battery reporting unavailable',
  detailKicker: 'monitored by',
  detailKickerAnon: 'monitored',
  detailEstimated: 'Charge estimated from voltage',
  detailMeasured: 'Charge read from the gauge',
  rosterEmpty:
    'The feed returned no repeaters inside the corridor for this window. That is a reading ' +
    'from the network, not a confirmed outage — check the official channels if you need to ' +
    'reach someone.',
  statusUnavailableLabel: 'Mesh feed unavailable',
  statusUnavailableNote:
    'The mesh feed could not be reached, so the network state is unknown. Rather than show a ' +
    'stale picture, the map is left empty — an empty map here means "we do not know", not ' +
    '"nothing is up".',
  failHeading: 'Mesh feed unavailable',
  failBody:
    "We couldn't reach the mesh feed right now. Rather than show a stale topology, here is " +
    'where the underlying data lives.',
  attribution: 'Mesh topology via data.sierragridteam.org · Node adverts via MeshCore',
} as const;

/**
 * The homepage Supporters band. Deliberately spare: it states the relationship and gets out
 * of the way. No superlatives, no "proudly" — the organizations listed are a fact about how
 * the network is funded and equipped, not a boast (docs/content-style-guide.md §2).
 */
export const supporters = {
  kicker: 'Supporters',
  heading: 'Organizations backing the network.',
  // Deliberately does NOT name what any one supporter gave. It sits directly above their
  // logo, so "equipment and funding" would read as a claim about them specifically — and we
  // only know that they support the work, not in which form.
  note:
    'Support from outside the membership is what puts a repeater on a ridge and keeps it ' +
    'there.',
  ctaLabel: 'Support this work',
  ctaHref: '/donate',
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
  /**
   * Standing legal notice at the foot of the page (NOT the site footer — it belongs to
   * this page's data). Provided by the organization; keep the wording as given.
   */
  disclaimerHeading: 'Limitation of Liability',
  disclaimerBody:
    'By accessing this site, you acknowledge and agree that the site operators, owners, and ' +
    'affiliated entities disclaim all liability and responsibility for any loss, damage, ' +
    'injury, fine, or legal enforcement action resulting from reliance on the preliminary ' +
    'data provided herein. Information is provided "as is" without warranties of any kind, ' +
    'express or implied.',
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
  /** Label for the RSS feed link in the /blog header (feed lives at /rss.xml). */
  feedLink: 'Subscribe via RSS',
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
  /** Standing automated-desk disclosure, rendered as page chrome — once at the feed footer
   *  and once per post page (not authored into each post body), for automated-desk posts
   *  (byline = deskName). Rendered with deskName leading and a trailing link to /colophon.
   *  (The emergency caveat is separate global chrome in SiteFooter.) */
  notes: {
    deskDisclosure:
      'is S.I.E.R.R.A’s automated news desk. Drafts are reviewed by a member before ' +
      'publication. How it works:',
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
        'conditions and incidents, project pages and release notes for technology. Most posts ' +
        'never cover unfolding emergencies — that is the Live Feed’s job — with one exception: ' +
        'during an active wildfire the desk keeps a single live-updating bulletin, framed each ' +
        'day as a timestamped digest of official figures that points to the Live Feed and ' +
        'CAL FIRE for real-time status. The desk never issues emergency instructions, and never ' +
        'reports on S.I.E.R.R.A’s own network or operations — members publish that news themselves.',
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

  /**
   * The mesh explainer, moved off /mesh (2026-09-17) when that page was reorganised around
   * monitoring. The status board answers "what is the network doing right now"; this answers
   * "what is it, and what does an observed link actually prove" — which a reader needs once,
   * not on every visit. /mesh links here from its foot.
   */
  mesh: {
    kicker: 'LoRa · MeshCore',
    title: 'The mesh, and what the map means.',
    intro:
      'Solar-powered LoRa relays that pass short text and telemetry across the foothills ' +
      'when power and cellular service are down. The map on the Mesh page draws what the ' +
      'network has actually been heard doing: every S.I.E.R.R.A repeater along the Ebbetts ' +
      'Pass corridor, and every relay link we observed between them.',
    sections: [
      {
        heading: 'What a link on the map means.',
        body:
          'A link means we heard two repeaters relay for each other, weighted by how often ' +
          'and how recently. How recently one was heard sets how bright and heavy it is, ' +
          'and how fast it pulses. Links between corridor repeaters heard in the last 30 ' +
          'days are always drawn.',
      },
      {
        heading: 'What it does not mean.',
        body:
          'It is not a routing table, and a faint link is not a link that is down — a ' +
          'backbone repeater can advert only twice a day and still be working. Nothing ' +
          'there is a guarantee of coverage at any given address, and it is never an ' +
          'all-clear.',
      },
      {
        heading: 'The wider mesh.',
        body:
          'Hollow markers are neighbouring MeshCore repeaters run by other operators — the ' +
          'one-hop neighbours our corridor nodes were heard relaying with. They are drawn ' +
          'faintly because they are context, not our infrastructure. The links out to them ' +
          'stay hidden until you select a repeater; all of them at once buried the corridor.',
      },
      {
        heading: 'What the monitors cover.',
        body:
          'Some of our repeater sites carry a monitor that reports battery, enclosure ' +
          'temperature and packet counters back to The Grid. The rest read "Limited ' +
          'Telemetry" — we hear them relaying, we just have nothing from the site itself. ' +
          'That is a gap in what we watch, not a judgement on the repeater: several of them ' +
          'are among the busiest in the corridor. Where a charge is shown it is usually ' +
          'estimated from voltage rather than read from a gauge, and the page says so.',
      },
    ],
    mapLink: { label: 'Open the mesh status board', href: '/mesh' },
    meshcoreLabel: 'MeshCore community map',
  },
} as const;

export const donate = {
  kicker: 'Support the Mission',
  title: 'Help keep the foothills connected.',
  intro:
    'S.I.E.R.R.A is an all-volunteer non-profit. Your support funds the solar-powered relays, ' +
    'radios, and training that keep neighbors and first responders connected when the grid and ' +
    'cell service are down.',
  // Zeffy is the provider (chosen for its zero-fee model — 100% of a gift reaches the org).
  // The two forms are embedded directly on this page; `src/components/ZeffyEmbed.astro`
  // carries the markup contract.
  giveHeading: 'Give now',
  giveNote:
    'Every dollar reaches S.I.E.R.R.A — our processor charges the organization no fees, and ' +
    'any tip you add goes to them rather than to us.',
  memberHeading: 'Become a member',
  memberNote:
    'Membership supports the network year-round and brings you into the roster of people who ' +
    'build and operate it.',
  embedFallback:
    'The giving form needs JavaScript. If it does not appear, a check by mail works just as ' +
    'well — the address is below.',
  waysHeading: 'Other ways to give',
  ways: [
    {
      name: 'By Mail',
      desc: 'Mail a check payable to the Signal Integrity & Emergency Radio Response Alliance, P.O. Box 2071, Murphys, CA 95247.',
    },
    {
      name: 'Equipment & In-Kind',
      desc: 'Radios, solar gear, antennas, and ridge-top tower space help as much as cash. Reach out via the contact page.',
    },
  ],
  // TODO(pre-launch): once 501(c)(3) status is confirmed, replace with the official
  // language + EIN. Until then this stays honest: no deductibility is claimed.
  taxNote:
    'S.I.E.R.R.A’s tax-exempt status and the deductibility of gifts are being finalized. ' +
    'Official confirmation and receipt details will be posted here once complete.',
} as const;
