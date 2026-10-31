/** Build-time values Vite replaces (only the VITE_ names below are read; src/backend/config.ts). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENTITLEMENT_PUBKEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
