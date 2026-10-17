/**
 * live-map.ts — the /live hazard map (MapLibre GL JS), extracted so the client controller can
 * build and refresh it. CLIENT-ONLY: it imports maplibre, so it must never be imported from
 * Astro frontmatter — only from a browser `<script>`.
 *
 * It stands on the same ground as /mesh (`map-ground.ts`: the restyled basemap and the
 * Calaveras/Tuolumne tint) and opens the same "blended label" card on a click
 * (`map-card.ts`). Esc, the card's ×, or a click on bare map closes it.
 *
 * `initHazardMap(figureEl, mapData, counties)` builds the map and returns a handle whose
 * `update(mapData)` pushes fresh hazard GeoJSON onto the existing sources (the 90s live
 * refresh) without rebuilding the map. On any failure (no WebGL, blocked tiles) it silently
 * leaves the SSR fallback note in place — the hazards are always in the stream.
 *
 * Colors are read from the CSS tokens at runtime (tokens.css stays the source of truth);
 * MapLibre paint needs literal colors, so we can't hand it var(--…) directly.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { escapeHtml as esc } from './format';
import { cardHtml, createMapCard, DOCK_BELOW } from './map-card';
import { decorateBasemap, loadBasemapStyle, mapColors } from './map-ground';
import { powerDetail, pspsWhen, wildfireTitle, wildfireStats, type LiveMapData } from './live-view';
import { severityLabel, type HazardProps } from './hazards';

type GeoFC = GeoJSON.FeatureCollection;

export interface MapHandle {
  update(data: LiveMapData): void;
  /** Highlight the on-map feature for a hazard id (null clears). Returns true if matched. */
  highlight(id: string | null): boolean;
}

const asFC = (data: LiveMapData, l: string): GeoFC =>
  (data.layers[l] as unknown as GeoFC) ?? { type: 'FeatureCollection', features: [] };

export function initHazardMap(
  figureEl: HTMLElement,
  mapData: LiveMapData,
  counties: GeoFC
): MapHandle | null {
  const canvas = figureEl.querySelector<HTMLElement>('[data-map-canvas]');
  if (!canvas) return null;

  const C = mapColors();
  // Hazard markers sit on the map's ground, so their outline is the ground colour.
  const ground = C.land;
  // severityRank → color (orange reserved for SEVERE/EXTREME).
  const sevColor = [
    'case',
    ['>=', ['get', 'severityRank'], 3],
    C.orange,
    ['==', ['get', 'severityRank'], 2],
    C.brass,
    C.green,
  ] as unknown as maplibregl.ExpressionSpecification;

  // Hover highlight: the alert stream sets a feature's `hover` state (keyed by its `id`)
  // when the matching card is hovered/focused; these paint expressions react. Green is the
  // site's interactive accent (not a risk color). `promoteId: 'id'` on the sources below
  // makes properties.id the feature id so setFeatureState can address it.
  const onHover = (off: unknown, on: unknown) =>
    [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      on,
      off,
    ] as unknown as maplibregl.ExpressionSpecification;

  // source id → the hazard layer whose features it holds (for the id index + highlight).
  const HL_SOURCES: Record<string, string> = {
    wildfire: 'wildfire',
    evacuation: 'evacuation',
    earthquake: 'earthquake',
    incidents: 'road_incident',
    road_segment: 'road_segment',
    power: 'power',
  };
  let mappedIds = new Set<string>();
  const indexIds = (data: LiveMapData) => {
    const ids = new Set<string>();
    for (const layer of Object.values(HL_SOURCES)) {
      for (const f of asFC(data, layer).features) {
        const id = (f.properties as { id?: unknown } | null)?.id;
        if (id != null) ids.add(String(id));
      }
    }
    mappedIds = ids;
  };
  indexIds(mapData);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let map!: maplibregl.Map;
  let built = false;
  /** The newest data, so a refresh that lands before the map is built isn't dropped. */
  let latest = mapData;

  const card = createMapCard(figureEl, {
    project: (at) => (built ? map.project(at) : null),
    onDismiss: () => {
      card.close();
      map?.getCanvas().focus();
    },
  });
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && card.isOpen) card.close();
  };
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', () => card.place());

  /** Every layer that opens a card — and so does not count as "bare map". */
  const INTERACTIVE = [
    'power-fill',
    'road_segment',
    'wildfire-fill',
    'evacuation-fill',
    'earthquake',
    'incidents',
    'wildfire-point',
  ];

  // Built once the restyled basemap is in hand (map-ground.ts), the same ground as /mesh.
  const build = (style: maplibregl.StyleSpecification | object) => {
    try {
      map = new maplibregl.Map({
        container: canvas,
        style: style as maplibregl.StyleSpecification,
        bounds: [
          [mapData.bounds.minLng, mapData.bounds.minLat],
          [mapData.bounds.maxLng, mapData.bounds.maxLat],
        ],
        fitBoundsOptions: { padding: 36 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: true,
      });
    } catch {
      return; // no WebGL → keep the SSR fallback
    }
    built = true;
    // Fit-to-bounds frames the whole service area, which leaves the populated Hwy 4/49
    // corridors small and surrounded by empty foothill. Open one zoom step tighter.
    //
    // Zooming alone is not enough: serviceAreaBounds runs east to -119.55 over empty Sierra,
    // so its midpoint sits well east of where anyone lives — tightening around it pushed
    // Murphys (HQ) to the frame edge. Recentre on the mean of the town markers, which is the
    // corridor's real centre of gravity. Every hazard is still one pan away, and all of them
    // are in the alert stream regardless. (getZoom() is valid immediately: the constructor
    // resolves `bounds` to a camera synchronously.)
    const townCentre = (() => {
      let n = 0;
      let lng = 0;
      let lat = 0;
      for (const f of mapData.towns.features as { geometry?: { coordinates?: number[] } }[]) {
        const c = f?.geometry?.coordinates;
        if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
        lng += c[0];
        lat += c[1];
        n++;
      }
      return n ? ([lng / n, lat / n] as [number, number]) : null;
    })();
    map.setZoom(map.getZoom() + 1);
    if (townCentre) map.setCenter(townCentre);
    map.on('error', () => {}); // swallow tile/style errors — never surface them
    // Settled signal for the deterministic screenshot harness: html[data-map-settled]
    // means the map has nothing left to render (set on idle, cleared by any render —
    // including resize repaints), so a capture never races a paint. Named to not collide
    // with the [data-live-map] figure hook in live.astro.
    const root = document.documentElement;
    map.on('render', () => {
      delete root.dataset.mapSettled;
    });
    map.on('idle', () => {
      root.dataset.mapSettled = '1';
    });
    // Zoom bottom-right and the credit bottom-left, as on /mesh.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.touchZoomRotate?.disableRotation();

    /**
     * On a narrow map the card docks over the map's foot, which is where a tapped hazard is
     * as often as not. Pan it into the strip still showing above the card.
     */
    const keepInView = (at: [number, number]) => {
      if (figureEl.clientWidth >= DOCK_BELOW) return;
      const cardH = figureEl.querySelector<HTMLElement>('.map-card')?.offsetHeight ?? 0;
      const y = map.project(at).y;
      const target = (figureEl.clientHeight - cardH) / 2;
      if (Math.abs(y - target) < 24) return;
      map.panBy([0, y - target], { duration: reduceMotion?.matches ? 0 : 300 });
    };

    /**
     * The card for a clicked hazard: severity and kind as the kicker (orange only for a SEVERE+
     * hazard), the headline, then where it is, its figures and the source. The same title and
     * stats derivations as the alert stream, so a fire reads identically on both surfaces
     * ("Owl Fire" · "120 acres · 30% contained").
     */
    const popup = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const p = (f?.properties ?? {}) as Record<string, unknown>;
      // MapLibre serializes object properties to JSON strings — parse defensively.
      const parseObj = <T>(v: unknown): T | undefined => {
        if (v && typeof v === 'object') return v as T;
        if (typeof v === 'string') {
          try {
            return JSON.parse(v) as T;
          } catch {
            return undefined;
          }
        }
        return undefined;
      };
      const src = parseObj<{ name?: string }>(p.source);
      const moreUrl = parseObj<{ sourceUrl?: string }>(p.provenance)?.sourceUrl;
      const line = (t: unknown, mod = '') =>
        t
          ? `<p class="map-card__line${mod ? ` map-card__line--${mod}` : ''}">${esc(String(t))}</p>`
          : '';
      const foot = src?.name
        ? moreUrl
          ? `<a href="${esc(moreUrl)}" target="_blank" rel="noopener external">${esc(src.name)}<span aria-hidden="true"> &#8599;</span></a>`
          : esc(src.name)
        : undefined;
      // A point hazard anchors on itself; an area or a road on the spot that was clicked,
      // marked with a ring since there is no dot there.
      const isPoint = f?.geometry?.type === 'Point';
      // The card keeps clear of the road corridors, the lines a reader is most likely tracing.
      const avoid = asFC(latest, 'road_segment').features.flatMap((g) =>
        g.geometry?.type === 'LineString'
          ? [g.geometry.coordinates as [number, number][]]
          : g.geometry?.type === 'MultiLineString'
            ? (g.geometry.coordinates as [number, number][][])
            : []
      );
      const at = (
        isPoint ? (f!.geometry as GeoJSON.Point).coordinates.slice(0, 2) : e.lngLat.toArray()
      ) as [number, number];

      // Road corridor: its status and travel figures, and the reason (description), rather
      // than the severity a hazard shows.
      const road = parseObj<{
        congestion?: string;
        delayMinutes?: number;
        durationMinutes?: number;
      }>(p.road);
      if (road && String(p.layer) === 'ROAD_SEGMENT') {
        const cong = road.congestion && road.congestion !== 'CLEAR' ? road.congestion : '';
        const bits = [
          road.durationMinutes != null ? `${road.durationMinutes} min` : null,
          (road.delayMinutes ?? 0) > 0 ? `+${road.delayMinutes} min delay` : null,
          cong ? `${cong.charAt(0)}${cong.slice(1).toLowerCase()} traffic` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        card.open({
          html: cardHtml({
            title: esc(String(p.headline || 'Road corridor')),
            titleStyle: 'text',
            kicker: `${String(p.status || 'open')} · Road conditions`,
            body: line(p.areaLabel) + line(bits, 'figures') + line(p.description),
            foot,
          }),
          label: 'Road details',
          at,
          ring: true,
          avoid,
        });
        keepInView(at);
        return;
      }

      const wf = parseObj<{ acres?: number; containment?: number }>(p.wildfire);
      const title = wildfireTitle(String(p.headline || p.kind || p.name || ''), wf);
      const pw = parseObj<HazardProps['power']>(p.power);
      const power = pw
        ? [
            pspsWhen({
              type: 'Feature',
              geometry: null,
              properties: { ...p, power: pw } as HazardProps,
            }),
            powerDetail(pw, String(p.status ?? '')),
          ]
            .filter(Boolean)
            .join(' · ') || null
        : null;
      const stats = wildfireStats(wf) ?? power;
      const kicker = [
        p.severity ? severityLabel(String(p.severity)) : null,
        p.kind ? String(p.kind) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      card.open({
        html: cardHtml({
          title: esc(title),
          titleStyle: 'text',
          kicker: kicker || 'Hazard',
          tone: Number(p.severityRank) >= 3 ? 'alarm' : 'default',
          body: line(p.areaLabel) + line(stats, 'figures'),
          foot,
        }),
        label: 'Hazard details',
        at,
        ring: !isPoint,
        avoid,
      });
      keepInView(at);
    };
    const interactive = (id: string) => {
      map.on('click', id, popup);
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    };

    map.on('load', () => {
      try {
        decorateBasemap(map, C, counties);

        // Subtle town reference dots, under everything — small + muted so they orient
        // without competing with the hazards (the basemap labels the towns).
        map.addSource('towns', { type: 'geojson', data: mapData.towns as unknown as GeoFC });
        map.addLayer({
          id: 'towns',
          type: 'circle',
          source: 'towns',
          paint: {
            'circle-radius': 3,
            'circle-color': C.muted,
            'circle-opacity': 0.55,
            'circle-stroke-color': ground,
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.6,
          },
        });

        // Power outages and shutoffs (PG&E polygons), lowest of the hazards: a PSPS can cover
        // most of the corridor, so roads, fires and evacuation zones must all draw over it.
        // Brass, escalating to orange only when the feed itself rates it SEVERE+ (risk, not
        // routine). A dotted edge keeps it from reading as a fire perimeter or an evac zone.
        const powerColor = [
          'case',
          ['>=', ['to-number', ['get', 'severityRank'], 0], 3],
          C.orange,
          C.brass,
        ] as unknown as maplibregl.ExpressionSpecification;
        map.addSource('power', { type: 'geojson', data: asFC(latest, 'power'), promoteId: 'id' });
        map.addLayer({
          id: 'power-fill',
          type: 'fill',
          source: 'power',
          paint: { 'fill-color': powerColor, 'fill-opacity': onHover(0.12, 0.3) },
        });
        map.addLayer({
          id: 'power-line',
          type: 'line',
          source: 'power',
          paint: {
            'line-color': powerColor,
            'line-width': onHover(1.25, 2.5),
            'line-dasharray': [1, 1.5],
          },
        });
        // Not `interactive()`: a PSPS polygon can cover most of the corridor, and MapLibre fires
        // a layer's click for everything under the pointer — so a click on a fire inside it
        // would open two stacked popups. The outage answers only when nothing drawn above it
        // does, and re-asserts the pointer on move (a higher layer's mouseleave clears it).
        const abovePower = [
          'road_segment',
          'wildfire-fill',
          'evacuation-fill',
          'earthquake',
          'incidents',
          'wildfire-point',
        ];
        map.on('click', 'power-fill', (e) => {
          const layers = abovePower.filter((id) => map.getLayer(id));
          if (map.queryRenderedFeatures(e.point, { layers }).length) return;
          popup(e);
        });
        map.on('mousemove', 'power-fill', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'power-fill', () => (map.getCanvas().style.cursor = ''));

        // Road-conditions corridors (road_segment lines), UNDER the hazards so incidents and
        // fires stay on top. Colored by the SAME tone as the roads table (promoted as `tone`):
        // open/clear is a quiet neutral hairline, a restricted/congested/chain-controlled
        // stretch escalates to brass and thickens. Orange is never used here — it stays
        // reserved for life-safety (fire/evac). Green appears only on hover (interactive
        // accent), mirroring the alert stream ↔ map highlight.
        const roadColor = [
          'match',
          ['get', 'tone'],
          'ok',
          C.muted,
          C.brass,
        ] as unknown as maplibregl.ExpressionSpecification;
        const roadWidth = [
          'match',
          ['get', 'tone'],
          'alarm',
          4,
          'elevated',
          3,
          2,
        ] as unknown as maplibregl.ExpressionSpecification;
        map.addSource('road_segment', {
          type: 'geojson',
          data: asFC(latest, 'road_segment'),
          promoteId: 'id',
        });
        map.addLayer({
          id: 'road_segment',
          type: 'line',
          source: 'road_segment',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': onHover(roadColor, C.green),
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              5,
              roadWidth,
            ] as unknown as maplibregl.ExpressionSpecification,
            'line-opacity': 0.9,
          },
        });
        interactive('road_segment');

        // Wildfire (orange, solid) vs evacuation (deep red, dashed zone boundary) — distinct
        // so a fire perimeter and a "must-leave" zone never read as one thing.
        const polys: { l: string; color: string; width: number; dash: number[] | null }[] = [
          { l: 'wildfire', color: C.orange, width: 1.5, dash: null },
          { l: 'evacuation', color: C.orangeDeep, width: 2.5, dash: [2, 1.5] },
        ];
        for (const cfg of polys) {
          map.addSource(cfg.l, { type: 'geojson', data: asFC(latest, cfg.l), promoteId: 'id' });
          map.addLayer({
            id: `${cfg.l}-fill`,
            type: 'fill',
            source: cfg.l,
            paint: { 'fill-color': cfg.color, 'fill-opacity': onHover(0.16, 0.34) },
          });
          map.addLayer({
            id: `${cfg.l}-line`,
            type: 'line',
            source: cfg.l,
            paint: {
              'line-color': cfg.color,
              'line-width': onHover(cfg.width, cfg.width * 2),
              ...(cfg.dash ? { 'line-dasharray': cfg.dash } : {}),
            },
          });
          interactive(`${cfg.l}-fill`);
        }

        // Earthquakes — hollow circles sized by magnitude.
        map.addSource('earthquake', {
          type: 'geojson',
          data: asFC(latest, 'earthquake'),
          promoteId: 'id',
        });
        map.addLayer({
          id: 'earthquake',
          type: 'circle',
          source: 'earthquake',
          paint: {
            'circle-radius': [
              '+',
              4,
              ['*', 2, ['coalesce', ['get', 'magnitude'], 1]],
              ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
            ] as unknown as maplibregl.ExpressionSpecification,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': onHover(sevColor, C.green),
            'circle-stroke-width': onHover(2, 3.5),
          },
        });
        interactive('earthquake');

        // Road incidents — filled severity circles, on top so accidents are most visible.
        map.addSource('incidents', {
          type: 'geojson',
          data: asFC(latest, 'road_incident'),
          promoteId: 'id',
        });
        map.addLayer({
          id: 'incidents',
          type: 'circle',
          source: 'incidents',
          paint: {
            'circle-radius': onHover(6, 9),
            'circle-color': sevColor,
            'circle-stroke-color': onHover(ground, C.green),
            'circle-stroke-width': onHover(2, 3.5),
          },
        });
        interactive('incidents');

        // A wildfire with no mapped perimeter arrives as a Point — the fill/line layers above
        // draw nothing for it, so it would vanish from the map (it stays in the stream). Add a
        // solid orange marker for point-geometry fires, on top, so the headline hazard always
        // shows. Shares the 'wildfire' source, so the 90s refresh updates it too.
        map.addLayer({
          id: 'wildfire-point',
          type: 'circle',
          source: 'wildfire',
          filter: ['==', ['geometry-type'], 'Point'] as maplibregl.FilterSpecification,
          paint: {
            'circle-radius': onHover(8, 11),
            'circle-color': C.orange,
            'circle-opacity': 0.9,
            'circle-stroke-color': onHover(ground, C.green),
            'circle-stroke-width': onHover(2, 3.5),
          },
        });
        interactive('wildfire-point');

        // Only hide the fallback once every layer added cleanly.
        const fb = figureEl.querySelector<HTMLElement>('[data-map-fallback]');
        if (fb) fb.style.display = 'none';
      } catch {
        /* keep the SSR fallback note visible if layer setup fails */
      }
    });

    // Bare map closes the card; a hazard's own click (above) opens one. Registered after the
    // layer handlers, so a hit test is enough to tell the two apart.
    map.on('click', (e) => {
      const layers = INTERACTIVE.filter((id) => map.getLayer(id));
      if (!map.queryRenderedFeatures(e.point, { layers }).length) card.close();
    });
    map.on('move', () => card.place());
  };
  void loadBasemapStyle(C).then(build);

  const setData = (id: string, data: GeoFC) => {
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  };

  const applyData = (data: LiveMapData) => {
    // Towns are static; refresh only the hazard sources (the 90s live poll).
    setData('power', asFC(data, 'power'));
    setData('road_segment', asFC(data, 'road_segment'));
    setData('wildfire', asFC(data, 'wildfire'));
    setData('evacuation', asFC(data, 'evacuation'));
    setData('earthquake', asFC(data, 'earthquake'));
    setData('incidents', asFC(data, 'road_incident'));
    indexIds(data);
  };

  // Drive the feature-state `hover` from the alert stream. Only ids actually present on the
  // map highlight; setFeatureState is applied across the hazard sources (only the one that
  // holds the id reacts) and guarded for a source that's mid-reload.
  let hoveredId: string | null = null;
  const setHover = (next: string | null): boolean => {
    if (!built) return false;
    const id = next && mappedIds.has(next) ? next : null;
    if (id !== hoveredId) {
      const flip = (fid: string | null, on: boolean) => {
        if (fid == null) return;
        for (const src of Object.keys(HL_SOURCES)) {
          if (!map.getSource(src)) continue;
          try {
            map.setFeatureState({ source: src, id: fid }, { hover: on });
          } catch {
            /* source mid-reload — ignore */
          }
        }
      };
      flip(hoveredId, false);
      hoveredId = id;
      flip(hoveredId, true);
    }
    return hoveredId != null;
  };

  return {
    update(data: LiveMapData) {
      latest = data;
      if (!built) return; // the map's load picks `latest` up
      // If a refresh lands while the style is (re)loading, don't drop it — apply the
      // latest data once the map next goes idle.
      if (map.isStyleLoaded()) applyData(data);
      else map.once('idle', () => applyData(data));
    },
    // Highlight the map feature for a hazard id (or clear with null). Returns whether an
    // on-map feature was matched, so the caller can mirror the active state on the card.
    highlight(id: string | null) {
      return setHover(id);
    },
  };
}
