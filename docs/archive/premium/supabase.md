# Supabase: what the code relies on, and where it was confirmed

Read 2026-10-31 on supabase.com/docs only. No live call was made. Anything marked CONVENTION was not found on supabase.com/docs and must be checked by the owner on the first real deploy (docs/BACKEND_SETUP.md, step 9).

## Auth (email OTP, no passwords)
Sources: supabase.com/docs/guides/auth/auth-email-passwordless and supabase.com/docs/reference/self-hosting-auth/introduction.
- The code is six digits. By default one request per 60 seconds, and the code expires after 1 hour. The Magic Link email template must contain `{{ .Token }}` to send a code instead of a link.
- `POST {SUPABASE_URL}/auth/v1/otp`, body `{ "email", "create_user": true }`, returns `{}` (200).
- `POST {SUPABASE_URL}/auth/v1/verify`, body `{ "email", "token", "type": "email" }`. The reference page's response section was cut off; the code expects the same session shape as the refresh token response (CONVENTION, `access_token`, `refresh_token`, `expires_in`, `user.id`, `user.email`).
- `POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, body `{ "refresh_token" }`, returns `access_token`, `expires_in`, `refresh_token`, `token_type` and `user`. `expires_at` is not documented, so the client computes it from `expires_in`.
- `POST {SUPABASE_URL}/auth/v1/logout` returns 204.
- `GET {SUPABASE_URL}/auth/v1/user` (Authorization: Bearer user JWT) returns the user. Functions use it to verify the caller.
- `DELETE {SUPABASE_URL}/auth/v1/admin/users/{user_id}` (secret key) is used by delete-account.
- The `/auth/v1` prefix in front of these paths is the hosted gateway path (CONVENTION; the self-hosting reference lists paths without it).

## Keys and headers
Source: supabase.com/docs/guides/api/api-keys, /docs/guides/functions/auth-headers and /docs/guides/functions/secrets.
- Publishable keys (`sb_publishable_...`) are safe in clients. Secret keys (`sb_secret_...`) must never reach a browser. The legacy `anon` and `service_role` keys are JWTs.
- Publishable and secret keys go in the `apikey` header, not in `Authorization: Bearer`. A signed-in user sends the session JWT in `Authorization` and the publishable key in `apikey`.
- The extension build reads `VITE_SUPABASE_ANON_KEY`, which holds the publishable key (or the legacy anon key). The name is kept from the task text.
- Functions have these by default: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` (JSON dictionaries, select with `["default"]`), `SUPABASE_JWKS`, and the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The code reads `SUPABASE_SECRET_KEYS["default"]` and falls back to the legacy variable.
- Secrets: `supabase secrets set --env-file <file>`, read with `Deno.env.get(name)`. A redeploy is not needed after a change.
- `verify_jwt` is on by default and is turned off per function in `supabase/config.toml` (`[functions.<name>] verify_jwt = false`). billing-webhook turns it off; the other functions keep it on and still call `/auth/v1/user` themselves.

## Edge Functions
Source: supabase.com/docs/guides/functions/quickstart and /docs/guides/functions/cors.
- URL: `https://<project-ref>.supabase.co/functions/v1/<name>`.
- CLI: `supabase login`, `supabase link --project-ref <ref>`, `supabase functions new <name>`, `supabase functions deploy <name>`.
- CORS: answer OPTIONS with the CORS headers. The allowed headers are `authorization, x-client-info, apikey, content-type`. The documented example allows `*`; we allow only the origins in `ALLOWED_ORIGINS`.

## Database
Source: supabase.com/docs/guides/api, /docs/guides/api/quickstart and /docs/guides/database/testing.
- REST base: `https://<project_ref>.supabase.co/rest/v1/`, for example `GET /rest/v1/<table>?select=*` with the `apikey` header.
- Tests: `.sql` files in `supabase/tests/database/`, run with `supabase test db`, using pgTAP (`begin; select plan(n); ... select * from finish(); rollback;`).
- CONVENTION (PostgREST, linked from /docs/guides/api but not shown there): `?col=eq.value` filters; `POST` with `Prefer: resolution=merge-duplicates` and `on_conflict=` for upsert; `DELETE` with a filter; `Prefer: return=representation`. All of these are in one file, backend/supabase/functions/_shared/rest.ts, behind the `Db` interface, so a correction touches one place.
- CONVENTION (RLS tests): `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'` is how `auth.uid()` is simulated in the pgTAP tests.
