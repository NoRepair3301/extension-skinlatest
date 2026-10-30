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

## 4. Response (VERIFIED 2026-10-30 by scripts/probe.ts, HTTP 200)
Top-level keys: id, status ("completed"), usage { total_tokens, total_input_tokens, input_tokens_by_modality[{modality,tokens}], total_cached_tokens, total_output_tokens, total_tool_use_tokens, total_thought_tokens, initial_input_tokens }, created, updated, service_tier, steps[], object ("interaction"), model.
`steps` held two items: `{ signature, type: "thought" }` and `{ content: [{ text, type: "text" }], type: "model_output" }`. The answer is the text of the `model_output` step; there is no top-level `output_text`. `system_instruction` plus `response_format` (type text, mime_type application/json, schema) in one request was accepted.
Latency: a 5-token answer took 8.9 s because the model spent 81 thought tokens first. Prompts that need a full StylePlan therefore take far longer than a 15 s timeout allows (see docs/HUMAN_CHECKS.md bake-off).

## 5. Models
`gemini-3.8-flash` is accepted by the endpoint (VERIFIED 2026-10-30, the response's `model` field echoes it). Other ids from the docs pages (`gemini-4-argon`) were not tried. Default: `gemini-3.8-flash`, configurable.

## 6. Errors
Troubleshooting page (not re-verified): 400 and 403 not retryable; 429 RESOURCE_EXHAUSTED and 503 UNAVAILABLE retryable.
VERIFIED 2026-10-30: HTTP 503 body is `{ "error": { "message": string, "code": string } }` (code was "service_unavailable", message said the model was under high demand). The response carried a `retry-after: 30` header (seconds). Header names seen on errors: alt-svc, content-encoding, content-type, date, retry-after, server, server-timing, transfer-encoding, vary, x-content-type-options, x-frame-options, x-xss-protection. Note `error.code` is a string here, not a number.
Not seen yet: 401/403/429 bodies. We map by HTTP status only, and retry once only when retry-after is 5 s or less (so a 30 s retry-after falls back to the next provider).

## 7. Free tier
The pricing page lists gemini-3.8-flash Standard as free of charge on the Free tier, with no RPM/TPM/RPD numbers ("not published").

## 8. Data use
Pricing page, Free plan card: "Content used to improve our products" (Free tier: Yes; Paid tier: No).

## 9. CORS from an extension service worker
Unclear. Not documented. With the optional host permission for `https://generativelanguage.googleapis.com/*` granted, extension fetches are not subject to page CORS in Chromium; the Test key button in the options page verifies this (human check).

## 10. Thinking control and lighter model (2026-10-30)
Sources: https://ai.google.dev/gemini-api/docs/thinking and https://ai.google.dev/gemini-api/docs/models
- Docs: `generation_config.thinking_level` at the top level of the Interactions request body; values `low`, `medium`, `high`, and `minimal` on some models. The page gives no "off" value and no token budget. Its REST example uses `"generation_config": {"thinking_level": "low"}` with `gemini-3.8-flash`.
- Docs list `gemini-3.5-flash-lite` (Stable) and recommend it or `gemini-3.8-flash` for new projects.
- Probes with the trivial prompt (one call each, 10 s apart):
  - `gemini-3.8-flash` + `thinking_level: "low"`: HTTP 429 after 868 ms (same error shape as 503: `{error:{message,code:string}}`, with a retry-after header). VERIFIED that it is rate-limited; UNVERIFIED whether the parameter is accepted (the 429 may have been returned before validation).
  - `gemini-3.5-flash-lite` (no thinking parameter): HTTP 200 in 5.7 s, `total_thought_tokens: 0` (a thought step with a signature was still present; the extractor skips it).
  - `gemini-3.5-flash-lite` + `thinking_level: "minimal"`: HTTP 200 in 5.7 s, parameter accepted.
- Even without thinking tokens a trivial flash-lite call took 5.7 s, so a full plan is unlikely to meet 15 s. No Gemini bake-off was run (a 429 was hit). Defaults in src/config.ts are unchanged.
