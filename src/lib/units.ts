/**
 * Unit conversions for display. The data.sierragridteam.org feed reports metric (°C, km,
 * km/h); the audience is US public-safety and residents, so we present imperial.
 * Pure functions — unit-tested in src/lib/grid.test.ts.
 */

export const cToF = (c: number): number => Math.round((c * 9) / 5 + 32);
export const kmToMi = (km: number): number => Math.round(km * 0.621371 * 10) / 10;
export const kmhToMph = (kmh: number): number => Math.round(kmh * 0.621371);

/** 16-point compass label from a wind bearing in degrees. */
export function degreesToCompass(deg: number): string {
  const points = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const idx = ((Math.round((deg % 360) / 22.5) % 16) + 16) % 16;
  return points[idx];
}

/** "30°C" → "86°F" style temperature string. */
export const formatTempF = (c: number): string => `${cToF(c)}°F`;
