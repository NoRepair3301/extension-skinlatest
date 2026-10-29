# Gemini (Google AI Studio)

Sources, fetched 2026-10-30:
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/interactions
- https://ai.google.dev/gemini-api/docs/troubleshooting
- https://ai.google.dev/gemini-api/docs/pricing

The current docs describe the Interactions API (not generateContent).

## 1. Endpoint
POST `https://generativelanguage.googleapis.com/v1beta/interactions`

## 2. Key
Header `x-goog-api-key: YOUR_KEY`, plus `Content-Type: application/json`.

## 3. Request (shape from the structured-output page, system instruction field from the interactions page)
```json
{
  "model": "gemini-3.8-flash",
  "system_instruction": "SYSTEM TEXT",
  "input": "USER TEXT",
  "response_format": {
    "type": "text",
    "mime_type": "application/json",
    "schema": { "type": "object", "properties": { "a": { "type": "string", "enum": ["x", "y"] } }, "required": ["a"] }
  }
}
```
- The structured-output page does not show `system_instruction`; the interactions page lists `system_instruction` as an interaction-scoped parameter (not carried over by `previous_interaction_id`). Combining them is not shown in one official example.
- `schema` objects in the docs use `type`, `properties`, `enum`, `required`. Other keywords (minimum, maximum, pattern) are not shown; we do not use them.

## 4. Response
UNVERIFIED. The pages show only SDK accessors (`output_text` in Python/JavaScript) and say the final answer is "the final `model_output`" step of the interaction. No raw REST response JSON is documented on these pages, and the API reference (`/api/interactions-api#Resource:Interaction`) was not available through the fetch tool. The adapter reads text through one isolated function (`extractGeminiText`) that fails closed (returns bad-output) when it does not find the documented hints. Confirm with the bake-off, then replace the function.

## 5. Models
`gemini-3.8-flash` (used in most examples on the docs pages). `gemini-4-argon` appears for structured outputs with tools (preview). Default: `gemini-3.8-flash`, configurable.

## 6. Errors (troubleshooting page)
- 400: client error, not retryable.
- 403: `PERMISSION_DENIED`, not retryable.
- 429: `RESOURCE_EXHAUSTED`, retryable.
- 503: `UNAVAILABLE`, retryable. "5xx" are retryable.
- 401, 500, 504 are not named; the JSON error body shape and any retry-after header are NOT documented there (the page defers to /gemini-api/docs/api-errors). We map by HTTP status only and treat a missing retry-after as "no retry here, fall back to the next provider".

## 7. Free tier
The pricing page lists gemini-3.8-flash Standard as free of charge on the Free tier, with no RPM/TPM/RPD numbers ("not published").

## 8. Data use
Pricing page, Free plan card: "Content used to improve our products" (Free tier: Yes; Paid tier: No).

## 9. CORS from an extension service worker
Unclear. Not documented. With the optional host permission for `https://generativelanguage.googleapis.com/*` granted, extension fetches are not subject to page CORS in Chromium; the Test key button in the options page verifies this (human check).
