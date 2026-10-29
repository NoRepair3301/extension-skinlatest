# PHASE 4: "Change my page" end to end (gate, baseline, consent, AI, validate, preview)

Goal: one click gives an instant built-in theme, then an AI-improved theme the user can keep, undo or retry.
Depends on: Phase 3 and the bake-off table (human sets the default provider order in src/config.ts). Recommended model: Opus at medium effort.

## Scope (in order, commit after each step)
1. src/ai/pipeline.ts: a state machine with an AbortSignal: gate, analyse, baseline apply, consent check, build payload, provider call, parse, validate (schema, contrast, eligibility), compile, apply as preview, wait for decision. Overall budget 20 s; baseline visible within 1 s.
2. Repair and fallback: on invalid output send one repair request containing reason codes only; if still invalid or a contrast target fails, use the nearest built-in theme (src/plan/nearestTheme.ts) and tell the user.
3. Consent: first AI use shows the SPEC 11 text with the provider name, "Send", "Cancel" and "Show what will be sent" (the exact payload JSON, read-only). Store `consentVersion` and `acceptedAt`; ask again when CONSENT_VERSION changes. No provider call before consent.
4. Popup states (Preact): idle, blocked(reason), working(step), preview (Keep, Undo, Try another, theme picker), error(kind). Copy from SPEC 11. No key means baseline only with the SPEC message.
5. Guards: at least 3 s between AI calls and at most 20 per day (settings counter, resets on date change); clear messages.
6. src/core/log.ts: debug logging off by default; it never logs payloads, plans or keys.
7. Keep stores the plan only in memory for now (Phase 5 persists it). Undo restores the previous baseline.

## Acceptance
1. [auto] `npm run check` green.
2. [auto] Pipeline tests with the mock provider cover: ok, invalid then repaired, invalid then fallback theme, rate then next provider, auth error message, timeout, abort, blocked page, no-ai page, no key, missing consent, guards.
3. [auto] Payload test: run the real analyser on fixtures with the Phase 1 marker technique; the payload contains no marker and is at most 20 KB.
4. [auto] Type and test proof that AI output reaches the compiler only through the validator.
5. [auto] The provider is never called before consent (spy), and never on blocked or no-ai pages.
6. [auto] Popup component tests (Preact + jsdom) for every state.
7. [human] With a real key on five public pages record for each: seconds to baseline, seconds to AI result, better/worse/broken. At least 3 of 5 should look acceptable; otherwise list failures in docs/BUGS.md. Undo restores the page.
8. [human] Switch the computer offline and click Transform: the baseline stays and the message says AI is unavailable.
9. [human] On a sign-in page and a payment-style page: the Network tab shows no provider request.

## Stop
Stop when items 1 to 6 pass and everything is committed. Print items 7 to 9. Do not start Phase 5.
