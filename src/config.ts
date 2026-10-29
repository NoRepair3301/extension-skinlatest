/** Hosts that source files and built JS may mention as URLs or call with fetch. Provider hosts are added in Phase 3 from docs/providers/. */
export const ALLOWED_URL_HOSTS: readonly string[] = [];

/** Hosts where Skinly never runs. */
export const BUILTIN_BLOCKLIST: readonly string[] = ["erp.iitkgp.ac.in"];

/** Schemes that belong to the browser itself. */
export const INTERNAL_SCHEMES: readonly string[] = [
  "chrome:",
  "edge:",
  "about:",
  "brave:",
  "chrome-extension:",
  "moz-extension:",
  "view-source:",
  "devtools:",
  "chrome-search:",
  "chrome-untrusted:",
];

/** Extension stores as host or host/path-prefix. Never changed by Skinly. */
export const WEB_STORES: readonly string[] = [
  "chromewebstore.google.com",
  "google.com/webstore",
  "microsoftedge.microsoft.com/addons",
  "addons.mozilla.org",
];
