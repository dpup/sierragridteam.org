/**
 * basemap.ts — the one basemap both MapLibre maps (/live hazards, /mesh topology) draw on.
 *
 * **OpenFreeMap Positron.** Same visual family as the CARTO Positron style we used before
 * (pale, low-chroma, label-forward — it sits under our overlays without competing), but
 * served by OpenFreeMap: no API key, no account, no rate limit, and a much lighter style
 * document (~25 KB vs ~107 KB). Tiles come from OpenStreetMap data via OpenMapTiles.
 *
 * Attribution is REQUIRED and is rendered as visible text under each map (we run MapLibre
 * with `attributionControl: false` so the credit sits in the figure caption, styled like
 * the rest of the page, rather than in a floating map widget).
 */

/** MapLibre style URL. Pale, low-chroma — overlays must stay the loudest thing on screen. */
export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** Host pattern, for the screenshot harness's offline tile stub. */
export const BASEMAP_HOST = 'tiles.openfreemap.org';

/** Required visible credit for the basemap. Callers append their own data attribution. */
export const BASEMAP_ATTRIBUTION = 'Basemap © OpenStreetMap contributors, © OpenFreeMap';
