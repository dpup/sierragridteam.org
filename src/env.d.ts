/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Live data feed base URL. Default: https://data.sierragridteam.org/api/v1 */
  readonly PUBLIC_GRID_API_BASE?: string;
  /** Override the public contact email (default: info@sierragridteam.org). */
  readonly PUBLIC_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
