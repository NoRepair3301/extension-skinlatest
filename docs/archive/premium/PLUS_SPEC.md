# Skinly Plus: spec (v0.3.0)

Owner decisions (2026-10-31). If this file and SPEC.md disagree on Plus, this file wins; SPEC.md section 18 points here.

## 1. Plans
| | Free | Plus |
|---|---|---|
| Themes | Calm light, Midnight, High contrast, Auto | Ocean, Warm paper, Field (and everything in Free) |
| Scenes | The scenes of the free themes (calm, midnight stars, space) | The scenes of Ocean, Warm paper and Field |
| Pets | All five | All five |
| Readability repair, own AI key, per-site memory | Yes | Yes |
| Custom assets (My assets) | No | Yes |
| Account | Not needed; works with no network | Email code sign-in (OTP), no passwords |

- Every list lives in one config: `TIERS` in src/core/entitlements.ts (CLAUDE.md: tier logic only there). The rest of the code asks `canUse(feature)` or `entitledThemes()`.
- Free needs no account and makes no network call. Signing in is only offered for Plus.
- The price, currency and interval come from the server `plans` table (active rows only). The extension never hardcodes a price.

## 2. Flows
1. **Sign in**: Settings, "Plan and account". The user types an email, gets a 6-digit code (Supabase Auth email OTP) and types it. The session (access and refresh token, expiry) is stored in storage.local `auth`. It is refreshed shortly before expiry. Sign out wipes `auth` and `entitlement`.
2. **Entitlement**: fetched on demand (Refresh purchase, after sign-in, after checkout) and at most once a day. get-entitlement returns a short-lived Ed25519-signed token: `{plan, sub, iat, exp, kid}`, valid 3 days. The extension verifies it with WebCrypto against the public key embedded at build time and caches it in `entitlement`. It counts as Plus while the token is valid, plus a 7-day offline grace after its expiry. A tampered, wrong-key, malformed or expired-past-grace token counts as Free.
3. **Upgrade**: create-checkout (through the billing adapter) returns a checkout URL. The options page opens it in a new tab with a plain link (no new permission). The provider's webhook updates `entitlements`, and the user clicks Refresh purchase (or waits for the daily check).
4. **Manage and cancel**: "Manage" opens the provider's customer page (adapter). Cancelling keeps Plus until `current_period_end`.
5. **Lapsed Plus**: a stored Plus theme falls back to the nearest free theme (popup, AI validator and auto script). The page is never broken. Local assets are never deleted, only hidden behind a calm locked state.
6. **Delete account**: a confirm dialog, then delete-account removes the entitlement, billing references, profile and the auth user. The extension wipes `auth` and `entitlement`; local themes, sites and assets stay (they never left the device).

## 3. Data the backend holds (nothing else)
- auth.users: email (Supabase Auth), with no password.
- profiles: user id, created_at.
- plans: id, name, interval, price_minor, currency, provider_ref, active (public catalogue).
- entitlements: user_id, plan, status, current_period_end, provider, provider_customer_ref, provider_subscription_ref, updated_at.
- billing_events: provider_event_id (unique), type, received_at. Never the raw payload.

Never sent to or held by the backend: page data, structural summaries, URLs, origins, site lists, themes, assets, AI keys, diagnostics. There is no cloud sync, no hosted AI and no telemetry.

## 4. Billing
- One adapter interface: `createCheckout`, `verifyWebhook`, `parseEvent` (backend/supabase/functions/_shared/billing.ts).
- Only implementation shipped: the test provider. It is clearly marked, and refused unless the function secret `BILLING_MODE=test`. The owner plugs in a real provider later (docs/BACKEND_SETUP.md, production checklist).
- Events handled: activated, renewed, cancelled, expired, refunded. Webhooks are idempotent through `billing_events.provider_event_id`.

## 5. Honesty about gating
The extension is open code: anyone can edit it to unlock Plus locally. Gating in the extension is a convenience, not security. The real enforcement is the signed entitlement, which only the server can issue. Plus has no server-side feature to protect (no hosted AI, no sync), so a locally patched build only fools itself. The docs and the store text say so.

## 6. Build configuration
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_ENTITLEMENT_PUBKEY come from the build environment (`.env.local`, gitignored). If any is missing, the build says "Plus not available in this build". Everything else works, and no Plus theme or asset unlocks.

## 7. Company
Legal text names "Change Directory 510" (placeholder; the owner confirms).
