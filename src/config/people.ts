/**
 * The people behind S.I.E.R.R.A — board members and advisors. Drives both the
 * About-page leadership cards (short bios) and the per-person profile pages at
 * /about/<slug> (full bios). Edit words here; layout lives in the components.
 *
 * Copy follows docs/content-style-guide.md (calm, institutional, no hype).
 * The bios state specific factual claims supplied by each member — present them
 * as provided and confirm with the person before changing a fact.
 * NOTE(pre-launch): Jay asked to review his bio wording before it ships — keep
 * his full bio verbatim unless he approves an edit.
 */
import type { ImageMetadata } from 'astro';
import jayPhoto from '../assets/profile-photos/jay-profile.jpg';
import allanPhoto from '../assets/profile-photos/allan-profile.jpg';
import danPhoto from '../assets/profile-photos/dan-profile.jpg';

/** One paragraph of a full bio. `lead` renders as a bold run-in label ("Law Enforcement:"). */
export interface BioParagraph {
  lead?: string;
  text: string;
}

/** A titled block of a full bio (title optional — plain paragraphs are fine). */
export interface BioSection {
  heading?: string;
  paragraphs: readonly BioParagraph[];
}

export interface Person {
  /** URL slug — /about/<slug>. */
  slug: string;
  /** Formal display name (cards, profile h1), e.g. "Jay L. Goldberg, J.D." */
  name: string;
  /** First name, for link text ("Read Jay's full profile"). */
  firstName: string;
  role: string;
  group: 'board' | 'advisor';
  /** Portrait. Omit (with initials as the stand-in) if none has been provided. */
  photo?: ImageMetadata;
  photoAlt?: string;
  /** Monogram shown when there is no photo. */
  initials: string;
  /** One sentence for meta description + OG card. */
  summary: string;
  /** 2–3 sentence bio for the About-page card. */
  shortBio: string;
  /** Lead paragraph opening the profile page. */
  intro: string;
  /** The rest of the full bio. */
  bio: readonly BioSection[];
}

export const people: readonly Person[] = [
  {
    slug: 'jay',
    name: 'Jay L. Goldberg, J.D.',
    firstName: 'Jay',
    role: 'Founder & President',
    group: 'board',
    photo: jayPhoto,
    photoAlt: 'Jay Goldberg smiling in a black winter jacket and cap in a snowy Sierra forest.',
    initials: 'JG',
    summary:
      'Founder & President of S.I.E.R.R.A — 20+ years as a security-firm COO, a law ' +
      'enforcement career, and active Search and Rescue service in Calaveras County.',
    shortBio:
      'Jay spent 20+ years as Chief Operating Officer of a San Francisco computer security ' +
      'consulting firm and retired from the Sonoma County Sheriff’s Department. An active ' +
      'Calaveras County Search and Rescue member and licensed ham operator, he operates the ' +
      'Ebbett’s Pass Radio Safety Network and founded S.I.E.R.R.A to keep agencies and ' +
      'residents connected when the grid is down.',
    // Jay's full bio is his approved copy — keep it verbatim (naming normalized to
    // "S.I.E.R.R.A" per the style guide). Confirm any other edit with Jay.
    intro:
      'Jay Goldberg balances a sharp executive mind with a lifelong commitment to community ' +
      'safety. With over two decades of corporate leadership, public safety, and hands-on ' +
      'volunteer service, Jay brings operational expertise and approachable leadership to ' +
      'every group he guides.',
    bio: [
      {
        heading: 'Corporate Leadership & Operational Excellence',
        paragraphs: [
          {
            lead: 'Executive Operations',
            text:
              'Jay spent 20+ years as Chief Operating Officer (COO) of a major computer ' +
              'security consulting firm in San Francisco. Starting the journey in 2006 with ' +
              'just five people, he scaled the business into a $15 million-a-year company ' +
              'with an international presence, serving prominent Silicon Valley venture ' +
              'capital and private equity firms.',
          },
        ],
      },
      {
        heading: 'Academic & Public Service Excellence',
        paragraphs: [
          {
            text:
              'Jay holds a B.S. in Criminal Justice Management from California State ' +
              'University, Sacramento, and a Juris Doctor (J.D.) degree, providing him a ' +
              'distinct advantage in navigating complex organizational, regulatory, and ' +
              'strategic environments.',
          },
          {
            lead: 'Law Enforcement',
            text:
              'Jay wrapped up his law enforcement career retiring from the Sonoma County ' +
              'Sheriff’s Department. His experience includes serving as a Crime Scene ' +
              'Technician and working with Vice/Felony Surveillance Teams for the Sacramento ' +
              'Police Department, as a Reserve Police Officer for Rohnert Park, and with the ' +
              'Santa Rosa Junior College Police Department.',
          },
          {
            lead: 'Fire & Emergency Response',
            text:
              'Jay served as a Volunteer Firefighter for the former Rincon Valley Fire ' +
              'Department and lent his radio communication skills as a Volunteer Dispatcher ' +
              'for Sacramento County Fire.',
          },
          {
            lead: 'Search & Rescue',
            text:
              'As an active member of the Calaveras County Sheriff’s Department Search and ' +
              'Rescue team, he responds 24/7 to emergency call outs.',
          },
          {
            lead: 'Emergency Communications',
            text:
              'Jay operates the Ebbett’s Pass Radio Safety Network. His electronics skills ' +
              'allowed him to build a new GMRS emergency repeater vital to the 2026 rescues ' +
              'of multiple individuals in a major snowstorm. As the founder of S.I.E.R.R.A, ' +
              'his vision is to fulfill a critical public need in the Sierra Nevada Counties ' +
              'by serving as an off-grid, centralized coordinating hub to ensure timely, ' +
              'meaningful emergency communications between public safety agencies and ' +
              'residents.',
          },
          {
            lead: 'Specialized Technical Skills',
            text:
              'Jay is a licensed ham radio operator, a licensed (not current) private pilot, ' +
              'and a former Master Certified Scuba Diver.',
          },
        ],
      },
      {
        paragraphs: [
          {
            text:
              'Whether organizing complex emergency protocols, auditing operational budgets, ' +
              'or collaborating with his team, Jay leads with transparency, humor, and ' +
              'integrity, ensuring the group’s mission always serves the community.',
          },
        ],
      },
    ],
  },
  {
    slug: 'corrinne',
    name: 'Corrinne Goldberg',
    firstName: 'Corrinne',
    role: 'Treasurer',
    group: 'board',
    // No photo provided yet — the monogram stands in until one arrives.
    initials: 'CG',
    summary:
      'Treasurer of S.I.E.R.R.A — more than 25 years of financial, operational, and ' +
      'organizational leadership across professional firms and nonprofits.',
    shortBio:
      'Corrinne brings more than 25 years of financial, operational, and organizational ' +
      'leadership to the alliance. Controller for a major IT consulting firm and previously ' +
      'Director of Operations for a medical-legal firm serving San Francisco and Oakland, ' +
      'she oversees S.I.E.R.R.A’s fiscal stewardship and financial integrity.',
    intro:
      'Corrinne Goldberg serves as Treasurer for S.I.E.R.R.A, bringing more than 25 years of ' +
      'financial, operational, and organizational leadership to the role. Her background ' +
      'spans financial management, operational oversight, database development, and ' +
      'nonprofit fundraising — the disciplines behind the alliance’s fiscal stewardship and ' +
      'financial integrity.',
    bio: [
      {
        paragraphs: [
          {
            text:
              'Corrinne previously served as Director of Operations for a major medical-legal ' +
              'firm serving the San Francisco and Oakland regions, where she managed complex ' +
              'operational processes, financial workflows, and administrative functions — ' +
              'building efficient systems and keeping organizations accountable.',
          },
          {
            text:
              'She is also active in the nonprofit sector as Assistant to the Treasurer for a ' +
              'Northern California sports hall of fame, where she manages the financial ' +
              'operations of a major annual fundraising event attended by more than 250 ' +
              'guests — payment processing, silent-auction revenue, and the reconciliation of ' +
              'every record.',
          },
          {
            text:
              'As Controller for a major IT consulting firm, Corrinne oversees accounts ' +
              'receivable and a range of other financial functions, and works closely with ' +
              'software developers to design and improve the business applications and ' +
              'operational databases behind them.',
          },
          {
            text:
              'She brings the same attention to detail, commitment to transparency, and ' +
              'collaborative, optimistic approach to S.I.E.R.R.A — making sure the ' +
              'alliance’s resources are managed responsibly in support of its mission.',
          },
        ],
      },
    ],
  },
  {
    slug: 'allan',
    name: 'Allan Claghorn',
    firstName: 'Allan',
    role: 'Secretary',
    group: 'board',
    photo: allanPhoto,
    photoAlt: 'Allan Claghorn in a dark jacket in an autumn forest with early snow.',
    initials: 'AC',
    summary:
      'Secretary of S.I.E.R.R.A — a veteran software engineer who designs and operates ' +
      'emergency communication infrastructure, focused on mesh networking.',
    shortBio:
      'Allan is a veteran software engineer with 28 years of experience who has spent years ' +
      'designing and operating emergency communication infrastructure — FM repeaters, Wi-Fi ' +
      'and microwave networks, and data communication servers. He focuses on the mesh ' +
      'systems that keep communities connected when conventional infrastructure fails.',
    intro:
      'Allan is a veteran software engineer with 28 years of experience building products ' +
      'for startups and established companies alike. Alongside a career in software ' +
      'development, he has spent years designing and operating emergency communication ' +
      'infrastructure, including FM radio repeaters, Wi-Fi and microwave networks, and data ' +
      'communication servers housed in data centers and cloud services.',
    bio: [
      {
        paragraphs: [
          {
            text:
              'Allan brings this combined background to S.I.E.R.R.A’s mission of building a ' +
              'secure, resilient community emergency radio service. With a deep interest in ' +
              'mesh networking technology, he is focused on advancing mesh systems that can ' +
              'keep communities connected when conventional infrastructure fails.',
          },
        ],
      },
    ],
  },
  {
    slug: 'dan',
    name: 'Dan Pupius',
    firstName: 'Dan',
    role: 'Technology Advisor',
    group: 'advisor',
    photo: danPhoto,
    photoAlt: 'Dan Pupius in a cap and black t-shirt by an alpine lake in the Sierra Nevada.',
    initials: 'DP',
    summary:
      'Technology Advisor to S.I.E.R.R.A — a licensed ham and NERT member who builds the ' +
      'network’s web presence and live data feeds.',
    shortBio:
      'Dan is responsible for the network’s web presence and live data feeds. A licensed ' +
      'amateur radio operator and San Francisco NERT member, he spent two decades as an ' +
      'engineering leader at Google, Medium, and his own startups — and once ran base camp ' +
      'operations for jungle research expeditions.',
    intro:
      'Dan builds and maintains S.I.E.R.R.A’s web presence and data infrastructure — the ' +
      'live feed, the mesh map, and the pipelines that pull relay telemetry, weather alerts, ' +
      'and fire data into one view. The goal is simple: the network’s status should be ' +
      'visible and useful, both to the volunteers who run it and the communities who depend ' +
      'on it.',
    bio: [
      {
        paragraphs: [
          {
            text:
              'He is a licensed amateur radio operator and a trained member of San ' +
              'Francisco’s Neighborhood Emergency Response Team (NERT). His interest in ' +
              'emergency communications is practical, not theoretical — resilient ' +
              'infrastructure is what lets neighbors help neighbors when everything else is ' +
              'down.',
          },
          {
            text:
              'Field logistics is old ground for him. Before his software career, Dan ' +
              'managed base camp and forest operations for Operation Wallacea, a biodiversity ' +
              'research organization — keeping remote expeditions supplied, staffed, and ' +
              'connected in places with no grid at all.',
          },
          {
            text:
              'Professionally, Dan is CTO at TheGP, where he leads a team of engineers who ' +
              'work alongside early-stage founders on AI adoption and architecture. Before ' +
              'that he co-founded Range, a team collaboration startup; ran engineering at ' +
              'Medium during its early years; and was a Staff Software Engineer at Google, ' +
              'where he worked on Gmail, Google+, and frontend infrastructure serving ' +
              'billions of users.',
          },
          {
            text:
              'He holds a BSc in Artificial Intelligence from the University of Manchester ' +
              'and an MA in Industrial Design from Sheffield Hallam University. In past ' +
              'lives he raced snowboards and jumped out of planes.',
          },
        ],
      },
    ],
  },
];

export const board = people.filter((p) => p.group === 'board');
export const advisors = people.filter((p) => p.group === 'advisor');

export function personBySlug(slug: string): Person | undefined {
  return people.find((p) => p.slug === slug);
}
