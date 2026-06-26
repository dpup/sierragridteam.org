/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Live data feed base URL. Default: https://info.ersn.net/api/v1 */
  readonly PUBLIC_ERSN_API_BASE?: string;
  /** "0" disables the build-time data fetch (offline builds use the snapshot). */
  readonly ERSN_FETCH_AT_BUILD?: string;
  /** Override the public contact email (default: info@sierragridteam.org). */
  readonly PUBLIC_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
