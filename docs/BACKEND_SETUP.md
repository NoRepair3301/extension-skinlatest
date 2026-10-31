# Skinly Plus: backend setup (owner steps)

Everything here runs on your machine and in your Supabase project. Nothing in this repo contains a secret. Sources for every endpoint and command: docs/backend/supabase.md.

## 0. What you need
- A Supabase account and the Supabase CLI.
- Node 22 or later (for the key script).
- This repo, with `npm ci` done.

## 1. Create the project
In the Supabase dashboard, create a project and note its project ref (the `<ref>` in `https://<ref>.supabase.co`).

## 2. Turn on email codes (no passwords)
1. Authentication, Providers: turn Email on. Do not turn on password sign-up for the extension; Skinly only uses codes.
2. Authentication, Email Templates, Magic Link: include `{{ .Token }}` so the email carries a 6-digit code (supabase.com/docs/guides/auth/auth-email-passwordless).
3. Keep the default limits (one code per 60 seconds; codes expire after 1 hour) or make them stricter.
4. Set up a custom SMTP sender before launch. The built-in sender is only for testing.

## 3. Log in and link
```
cd backend
supabase login
supabase link --project-ref <ref>
```

## 4. Database
```
supabase db push
supabase test db
```
`db push` applies `supabase/migrations/20261031000000_plus.sql` (tables, RLS, select-only policies). `test db` runs `supabase/tests/database/rls.test.sql` (pgTAP) against your local stack. It proves that a user reads only their own entitlement and the active plans, and can write nothing. Load the test catalogue with `supabase/seed.sql`, or insert your own row into `plans`. The price shown to users comes from that row.

## 5. Keys and secrets
From the repo root:
```
node scripts/gen-entitlement-keys.mjs
```
This writes `ENTITLEMENT_PRIVATE_KEY` and `ENTITLEMENT_PUBLIC_KEY` to `private/backend.secrets.env` (gitignored) and prints only the public key. Add the remaining names from `backend/.env.example` to the same file:
- `ALLOWED_ORIGINS=chrome-extension://<your extension id>`. The id is shown on the browser's extensions page; for the store build use the store id. Use commas for more than one.
- `BILLING_MODE=test` (test provider only; see step 9).
- `TEST_WEBHOOK_SECRET=` and `TEST_CHECKOUT_SECRET=`: two different random strings of at least 32 characters, for example from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Then set them as function secrets:
```
supabase secrets set --env-file private/backend.secrets.env
```
`SUPABASE_URL` and the project keys are provided to functions by Supabase. Never put the secret key in the extension.

## 6. Deploy the functions
```
supabase functions deploy get-entitlement
supabase functions deploy create-checkout
supabase functions deploy billing-webhook
supabase functions deploy delete-account
supabase functions deploy test-checkout
```
`supabase/config.toml` keeps `verify_jwt` on for the user functions and turns it off for `billing-webhook` and `test-checkout`. Those two check signatures themselves.

## 7. Build the extension with Plus
Create `.env.local` in the repo root (gitignored) with the names from `.env.example`:
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your publishable key, sb_publishable_...>
VITE_ENTITLEMENT_PUBKEY=<the public key printed in step 5>
```
Then run `npm run check` and `npm run release`. Without these values the build says "Plus isn't available in this build" and Free works as before.

## 8. Test-mode flow (no money)
1. Load `dist/` unpacked. Settings, Plan and account: type your email, choose "Email me a code", type the code.
2. Choose "Upgrade to Plus". A tab opens with the test checkout. It says "TEST MODE: no money was taken".
3. Back in Settings, choose Refresh purchase. The plan line says Plus. In the popup, Ocean, Warm paper and Field lose their Plus mark.
4. To test a webhook by hand, sign a body with `TEST_WEBHOOK_SECRET` (the format is in `backend/supabase/functions/_shared/billing.ts`, `signTestWebhook`) and POST it to `https://<ref>.supabase.co/functions/v1/billing-webhook` with the header `skinly-test-signature`. Try "expired" or "refunded", then Refresh purchase.
5. Delete account: the confirm dialog, then the account and its rows are gone (check the Authentication and Table editor pages).
6. Check the REST conventions noted in docs/backend/supabase.md (CONVENTION items). The first webhook and the first delete exercise all of them; read the function logs, which contain only an event word and a request id.

## 9. Production checklist (before charging anyone)
- [ ] Choose a payment provider. Implement `BillingProvider` (`createCheckout`, `verifyWebhook`, `parseEvent`) in `_shared/billing.ts`, wire it in `createBillingProvider`, and keep the test provider refused outside `BILLING_MODE=test`. Add a customer-portal link for Manage if the provider has one.
- [ ] Complete the provider's account verification (KYC), payouts and business details.
- [ ] Register the webhook URL `https://<ref>.supabase.co/functions/v1/billing-webhook` with the provider, and set its signing secret as a function secret.
- [ ] Publish the refund and cancellation policy (cancel any time, Plus until the end of the paid period).
- [ ] Publish the terms of service and the privacy policy (docs/store/privacy.md, with the company name confirmed: "Change Directory 510" is a placeholder).
- [ ] Sort out tax: VAT or GST registration where needed, or a merchant-of-record provider.
- [ ] Set a support email in the store listing and the privacy policy.
- [ ] Set `BILLING_MODE` to the real provider's mode, rotate `TEST_*` secrets out, and run `supabase test db` again.
- [ ] Custom SMTP sender for the code emails; check the email text.
- [ ] Back up the entitlement private key offline. Losing it means every user must Refresh purchase after a new key ships.
