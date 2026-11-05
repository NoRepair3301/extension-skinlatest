# Sections removed from the living docs (S4.5)

Historical only. Copied verbatim from the files named in each heading before the Skinly Plus text was taken out of them. Nothing here is used by the build, the tests or the release.

## docs/SPEC.md section 12 (Entitlements)
## 12. Entitlements
src/core/entitlements.ts is the only place with tier logic and the Free/Plus lists (v0.3.0, docs/PLUS_SPEC.md). `canUse(feature)` answers from a derived plan flag (`free` or `plus`) that src/backend/ computes from a verified, signed entitlement. Free: calm-light, midnight, high-contrast, Auto, five pets, the scenes of those themes, readability repair, own AI key, per-site memory. Plus: ocean, warm-paper, field with their scenes, and custom assets. Not entitled: a Plus theme is clamped to the nearest free one (popup, AI validator, auto script); local assets are hidden, never deleted.


## docs/SPEC.md section 18 (Skinly Plus)
## 18. Skinly Plus (v0.3.0, owner decisions)
docs/PLUS_SPEC.md is the source of truth for plans, flows and the data the backend holds; docs/SECURITY_BACKEND.md is the threat model. In short: accounts optional (email OTP), price from the server `plans` table, billing through an adapter with only a test provider (refused unless BILLING_MODE=test), no cloud sync, hosted AI or telemetry, the backend never receives page data, URLs, origins, site lists or keys. Storage adds `auth` (session) and `entitlement` (signed token cache, 7-day offline grace). fetch() is allowed in src/providers/ and src/backend/ only. Missing build config means "Plus not available in this build" and Free works as before.

## docs/ARCHITECTURE.md (Plus rows and data-flow block)
| `src/backend` | Skinly Plus client (0.3.0): the other place with `fetch`, only to the Supabase project from the build env. Email-code auth (`auth`), the signed entitlement (`entitlement`), offers, checkout, delete account. Never imported by a page script. |
| `src/core/entitlements.ts`, `src/extension/planFlag.ts` | Tier config (`TIERS`, `canUse`, clamp to the nearest free theme) and the derived `plan` flag, which page scripts read instead of tokens. |
| `backend/supabase` | Migrations with RLS, pgTAP RLS test, Edge Functions. All logic lives in pure modules under `functions/_shared`, tested with Vitest; each `index.ts` is one `Deno.serve` line. docs/SECURITY_BACKEND.md is the threat model. |

Skinly Plus (optional, no page data):
options page -> src/backend -> Supabase Auth (email code) -> session in `auth`
   -> get-entitlement (signed Ed25519 token, 3 days) -> verified with the build's public key -> `entitlement`
   -> derived flag `plan` {free|plus, until} -> popup, pipeline, commands, auto script, scene script clamp Plus themes and hide assets
payment provider -> billing-webhook (signature, replay window, idempotent) -> entitlements row
```

## docs/AUDIT.md C15 (Backend)
C15. Backend (v0.3.0): RLS enabled on every table with select-only policies (backend/supabase/migrations, backend/supabase/tests/rls.test.sql); webhook signature check is constant-time, has a replay window and is idempotent; the test billing provider is refused unless BILLING_MODE=test; `git log -p` has no secret-like string (`git log -p | grep -E 'sk_live_|rzp_(live|test)_|whsec_|BEGIN [A-Z ]*PRIVATE KEY'`).

## docs/QA.md (0.3.0 Skinly Plus checks)
## 0.3.0: Skinly Plus (test mode, docs/BACKEND_SETUP.md steps 1 to 8 done first)
| # | Check | Steps | Edge | Chrome |
|---|---|---|---|---|
| P1 | No config | Build without .env.local: Settings, Plan and account says Plus isn't available; Ocean, Warm paper and Field carry the Plus mark; Free themes work offline | | |
| P2 | Locked theme | Free: choose Ocean in the popup: the dialog shows the server price, how to cancel and Stay on Free; the theme does not change | | |
| P3 | Sign in | Email, code from the email, signed in; the code email arrives within a minute | | |
| P4 | Test purchase | Upgrade: a tab says TEST MODE; Refresh purchase: Plus, with a renewal date; the Plus marks are gone | | |
| P5 | Assets | Plus: My assets works; webhook "expired", Refresh purchase: My assets shows the locked line, the files are still listed after upgrading again | | |
| P6 | Lapsed site | Keep Ocean on a site while Plus; expire Plus; reload: the site shows Calm light with its art, nothing breaks | | |
| P7 | Offline | Plus, go offline, restart the browser: still Plus (grace); the settings page says you're offline | | |
| P8 | Sign out, delete | Sign out: Free, themes and sites still there. Sign in again, Delete account: confirm dialog, then the user is gone from the dashboard | | |
| P9 | Network tab | During all of the above, requests go only to <ref>.supabase.co and the AI provider; none carries a page address, site or key | | |
