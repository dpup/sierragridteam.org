/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Live data feed base URL. Default: https://info.ersn.net/api/v1 */
  readonly PUBLIC_ERSN_API_BASE?: string;
  /** "0" disables the build-time data fetch (offline builds use the snapshot). */
  readonly ERSN_FETCH_AT_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
