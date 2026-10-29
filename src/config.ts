/** Hosts that source files and built JS may mention as URLs or call with fetch. Provider hosts are added in Phase 3 from docs/providers/. */
export const ALLOWED_URL_HOSTS: readonly string[] = [];

/** Hosts where Skinly never runs. */
export const BUILTIN_BLOCKLIST: readonly string[] = ["erp.iitkgp.ac.in"];
