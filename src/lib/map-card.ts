/**
 * map-card.ts — the map card both maps open on a click (/live hazards, /mesh repeaters and
 * links): the "blended label". It is made of map material rather than laid over the map — the
 * basemap's own colour, a feathered edge, a 1px leader to the feature — and is placed where it
 * covers none of the lines being read. Below DOCK_BELOW it docks to the map's foot instead.
 * Styles: src/styles/map.css (`.map-card*`).
 *
 * Also owns the map's hint chip (top-left), since both live in the same overlay layer.
 *
 * Framework-free and maplibre-free: the caller passes `project` (lngLat → screen point) and
 * calls `place()` on every camera move.
 */
import { escapeHtml as esc } from './format';

type LngLat = [number, number];

/** Card width, mirrored by `.map-card` in map.css. */
export const CARD_W = 264;
/** Below this map width the card docks to the bottom edge instead of floating. */
export const DOCK_BELOW = 600;

export interface OpenCard {
  /** Card body HTML — build it with `cardHtml`. */
  html: string;
  /** The dialog's accessible name. */
  label: string;
  /** Where the leader points. */
  at: LngLat;
  /** Mark the anchor with a hollow ring (a point on a line, which has no dot of its own). */
  ring?: boolean;
  /** Lines the card should not cover, as lngLat polylines. */
  avoid?: LngLat[][];
}

export interface MapCard {
  open(card: OpenCard): void;
  close(): void;
  /** Re-place after a camera move or resize. */
  place(): void;
  readonly isOpen: boolean;
  /** The "zoomed to fit…" chip; the caller sets its content and `hidden`. */
  readonly hint: HTMLElement;
  destroy(): void;
}

/** One figure in a card's metrics row. `value` null renders an em dash, never a zero. */
export const cardMetric = (value: string | null, unit: string | null, label: string) =>
  `<div class="map-card__metric"><p class="map-card__value">` +
  (value == null
    ? `<span class="map-card__na">&#8212;</span>`
    : esc(value) + (unit ? `<span class="map-card__unit">${esc(unit)}</span>` : '')) +
  `</p><p class="map-card__label">${esc(label)}</p></div>`;

/**
 * A card's markup. `title` is trusted HTML (callers escape names); everything else is escaped
 * here except `body`, which is built from `cardMetric` or the caller's escaped lines.
 * `tone: 'alarm'` turns the kicker orange — for a genuine risk only.
 */
export function cardHtml(o: {
  title: string;
  /** 'name' (default): a short uppercase name, as a map label. 'text': a sentence-case
   *  headline, for a hazard whose title is a phrase rather than a name. */
  titleStyle?: 'name' | 'text';
  kicker: string;
  tone?: 'alarm' | 'default';
  metrics?: string;
  body?: string;
  foot?: string;
}) {
  return (
    `<div class="map-card__head"><p class="map-card__title${o.titleStyle === 'text' ? ' map-card__title--text' : ''}">${o.title}</p>` +
    `<button type="button" class="map-card__close" data-card-close aria-label="Close">` +
    `<span aria-hidden="true">&#215;</span></button></div>` +
    `<p class="map-card__kicker${o.tone === 'alarm' ? ' map-card__kicker--alarm' : ''}">${esc(o.kicker)}</p>` +
    (o.metrics ? `<div class="map-card__metrics">${o.metrics}</div>` : '') +
    (o.body ? `<div class="map-card__body">${o.body}</div>` : '') +
    (o.foot ? `<p class="map-card__foot">${o.foot}</p>` : '')
  );
}

/** Does a screen-space segment cross a rectangle? Liang–Barsky clip. */
function crosses(
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  r: { l: number; t: number; r: number; b: number }
) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [
    [-dx, x0 - r.l],
    [dx, r.r - x0],
    [-dy, y0 - r.t],
    [dy, r.b - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

export function createMapCard(
  figureEl: HTMLElement,
  opts: {
    /** lngLat → pixel position inside the figure; null while the map isn't built. */
    project: (at: LngLat) => { x: number; y: number } | null;
    /** The card's × was pressed. */
    onDismiss: () => void;
  }
): MapCard {
  const layer = document.createElement('div');
  layer.className = 'map-card-layer';
  layer.innerHTML =
    `<svg class="map-card-leader" aria-hidden="true"><line/></svg>` +
    `<span class="map-card-anchor" aria-hidden="true" hidden></span>` +
    `<div class="map-card" role="dialog" tabindex="-1" hidden></div>` +
    `<p class="map-hint" hidden></p>`;
  figureEl.appendChild(layer);
  const card = layer.querySelector<HTMLElement>('.map-card')!;
  const leader = layer.querySelector<SVGLineElement>('.map-card-leader line')!;
  const svg = leader.parentElement as unknown as SVGSVGElement;
  const anchorRing = layer.querySelector<HTMLElement>('.map-card-anchor')!;
  const hint = layer.querySelector<HTMLElement>('.map-hint')!;

  let current: OpenCard | null = null;

  /**
   * Put the card where it covers none of `avoid`. Tries the four diagonals at three leader
   * lengths — below-right and short first — and keeps the first placement that fits inside
   * the map and crosses the fewest segments. A feature whose lines fan out to one side gets
   * its card on the other, on a longer leader.
   */
  const place = () => {
    if (!current) return;
    const p = opts.project(current.at);
    if (!p) return;
    const box = figureEl.getBoundingClientRect();
    anchorRing.style.transform = `translate(${p.x}px, ${p.y}px)`;

    if (box.width < DOCK_BELOW) {
      // Docked: full width along the bottom, no leader.
      card.classList.add('map-card--docked');
      card.style.transform = '';
      svg.style.display = 'none';
      return;
    }
    card.classList.remove('map-card--docked');
    const w = CARD_W;
    const h = card.offsetHeight || 140;
    const segs = (current.avoid ?? []).map((s) =>
      s.map((c) => opts.project(c)).flatMap((q) => (q ? [[q.x, q.y] as [number, number]] : []))
    );
    let best: { x: number; y: number; cx: number; cy: number; score: number } | null = null;
    const dirs: [number, number][] = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    dirs.forEach(([sx, sy], di) => {
      for (const [li, len] of [36, 90, 150].entries()) {
        const d = len / Math.SQRT2;
        const cx = p.x + sx * d; // the card corner the leader meets
        const cy = p.y + sy * d;
        const x = sx > 0 ? cx : cx - w;
        const y = sy > 0 ? cy : cy - h;
        if (x < 8 || y < 8 || x + w > box.width - 8 || y + h > box.height - 8) continue;
        const rect = { l: x, t: y, r: x + w, b: y + h };
        let hits = 0;
        for (const s of segs) {
          for (let i = 1; i < s.length; i++) if (crosses(s[i - 1], s[i], rect)) hits++;
        }
        const score = hits * 100 + li * 3 + di;
        if (!best || score < best.score) best = { x, y, cx, cy, score };
      }
    });
    // Nowhere fits cleanly (a tiny map): fall back to inside the top-right corner.
    const pick = best ?? { x: box.width - w - 8, y: 8, cx: box.width - w - 8, cy: 8 };
    card.style.transform = `translate(${Math.round(pick.x)}px, ${Math.round(pick.y)}px)`;
    svg.style.display = '';
    leader.setAttribute('x1', String(p.x));
    leader.setAttribute('y1', String(p.y));
    leader.setAttribute('x2', String(pick.cx));
    leader.setAttribute('y2', String(pick.cy));
  };

  const close = () => {
    current = null;
    card.hidden = true;
    anchorRing.hidden = true;
    svg.style.display = 'none';
  };

  const open = (c: OpenCard) => {
    current = c;
    card.innerHTML = c.html;
    card.setAttribute('aria-label', c.label);
    card.hidden = false;
    anchorRing.hidden = !c.ring;
    card.classList.remove('map-card--in');
    // Next frame, so the fade runs from zero (none at all under reduced motion — CSS).
    requestAnimationFrame(() => card.classList.add('map-card--in'));
    place();
    card
      .querySelector<HTMLButtonElement>('[data-card-close]')
      ?.addEventListener('click', () => opts.onDismiss());
    card.focus({ preventScroll: true });
  };

  return {
    open,
    close,
    place,
    get isOpen() {
      return current != null;
    },
    hint,
    destroy: () => layer.remove(),
  };
}
