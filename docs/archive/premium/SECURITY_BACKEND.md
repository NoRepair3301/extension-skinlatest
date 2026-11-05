# Backend threat model (Skinly Plus, v0.3.0)

Assets to protect: the entitlement signing key, the service role key, the billing webhook secret, users' emails, and the integrity of `entitlements`.
Trust boundaries: the extension (open code, untrusted), Supabase Auth (trusted), Edge Functions (trusted, hold secrets), the payment provider (trusted only through a verified signature).

| Threat | Mitigation | Test |
|---|---|---|
| Forged webhook | HMAC-SHA256 over `timestamp.body` with the webhook secret, compared in constant time; unknown or missing signature headers are refused with a generic 400. | tests/backend/webhook.test.ts "forged" |
| Replayed webhook | The timestamp must be within 5 minutes of the server clock; `billing_events.provider_event_id` is unique, so a second delivery is acknowledged without effect. | tests/backend/webhook.test.ts "replay", "idempotent" |
| Out-of-order events | State transitions are a pure table (`nextEntitlement`); an older event cannot extend a period or resurrect a refunded entitlement. | tests/backend/billing.test.ts "transitions" |
| Token theft (session) | The session lives only in extension storage.local `auth`; it is never sent to content scripts or pages (import graph test) and never logged; refresh rotates it; sign-out and delete wipe it. Threat accepted: anyone with the browser profile can read it (same as the AI keys). | tests/backend-client/auth.test.ts, tests/auto.test.ts "no page script" |
| Token theft (entitlement) | The entitlement token carries only plan, sub (user id), iat, exp and kid, with no email; it expires after 3 days; a stolen copy unlocks only local Plus themes, which the open code could unlock anyway. | tests/backend/token.test.ts |
| Entitlement spoofing | Ed25519 signature checked by WebCrypto in the extension against the build-time public key; `kid` must match; tampered payload, wrong key, bad `alg` or expired-past-grace token counts as Free. The private key is generated locally (scripts/gen-entitlement-keys.mjs) into gitignored private/ and set as a function secret only. | tests/backend/token.test.ts, tests/backend-client/entitlement.test.ts |
| RLS bypass | RLS enabled on every table; `select` policies only: a user reads only their own entitlement and profile, anyone reads active plans; no insert, update or delete policy exists, so only the service role (inside functions) writes. Documented SQL tests run with `supabase test db`. | backend/supabase/tests/rls.test.sql |
| Service role key leak | Never in the extension: the scanner forbids `service_role` in src and dist and JWT-like strings everywhere; functions read it from the environment only. | tests/rules.test.ts "secrets" |
| Abuse (code spam, checkout spam) | Supabase Auth rate-limits OTP emails; every function has a per-user (or per-IP for anonymous) fixed-window limit; strict input validation with size caps; generic errors. | tests/backend/ratelimit.test.ts, tests/backend/validate.test.ts |
| CORS abuse from other sites | Functions answer only origins listed in the `ALLOWED_ORIGINS` secret (the extension's chrome-extension:// origin). | tests/backend/http.test.ts "cors" |
| PII in logs | Functions log only a request id and an error kind; never emails, tokens, bodies or headers. | tests/backend/http.test.ts "no PII" |
| Account deletion | delete-account verifies the JWT, deletes entitlements, profile and billing references for that user, then the auth user (service role); the extension wipes `auth` and `entitlement`. billing_events hold no user data and stay for idempotency. | tests/backend/delete.test.ts |
| Test billing in production | The test provider is refused unless `BILLING_MODE=test`; test-checkout returns 404 otherwise. | tests/backend/billing.test.ts "test mode only" |

Limits: Supabase's own infrastructure, the payment provider's security and a compromised browser profile are out of scope. Edge Functions run Deno; all logic is in plain TypeScript modules (backend/supabase/functions/_shared) tested with Vitest, and only thin Deno entry files touch `Deno.*`.
