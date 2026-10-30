# Groq

Sources, fetched 2026-10-30:
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/errors
- https://console.groq.com/docs/rate-limits

## 1. Endpoint
POST `https://api.groq.com/openai/v1/chat/completions`
(The structured-output page shows `curl -d` examples; the method is not stated explicitly, a body POST is implied.)

## 2. Key
Header `Authorization: Bearer YOUR_KEY`, plus `Content-Type: application/json`.

## 3. Request
```json
{
  "model": "openai/gpt-oss-120b",
  "messages": [
    { "role": "system", "content": "SYSTEM TEXT" },
    { "role": "user", "content": "USER TEXT" }
  ],
  "response_format": { "type": "json_object" }
}
```
JSON object mode is documented as available on all models. Schema-enforced mode uses `"response_format": { "type": "json_schema", "json_schema": { "name": ..., "strict": true, "schema": {...} } }` and is documented for `openai/gpt-oss-20b`, `openai/gpt-oss-120b` (and two other ids). We use JSON object mode and validate the answer ourselves. The system prompt must describe the JSON format.

## 4. Response
The page shows the answer read as `response.choices[0].message.content` (a JSON string, parsed with JSON.parse). The full response object and `usage` fields are not documented on these pages, so usage is not read.

## 5. Models
`openai/gpt-oss-120b` is listed for structured outputs (strict and best-effort). Default: `openai/gpt-oss-120b`, configurable. `llama-3.3-70b-versatile` is used in the JSON-mode example.

## 6. Errors (errors page)
VERIFIED 2026-10-30 (scripts/probe.ts): a rejected key returns HTTP 401 with body `{ "error": { "message": string, "type": "invalid_request_error", "code": "invalid_api_key" } }`; header names seen: alt-svc, cache-control, cf-cache-status, cf-ray, connection, content-length, content-type, date, server, set-cookie, strict-transport-security, vary, via, x-groq-region, x-request-id. No retry-after on 401.
The earlier key was rejected. With a working key (2026-10-30, bake-off) the answer was read from `choices[0].message.content` and `openai/gpt-oss-120b` was accepted with `response_format: json_object`: VERIFIED. Median latency 2.5 s on real StylePlan prompts. A 429 occurred on the 5th call; its body and retry-after were not inspected, so the limit that was hit (RPM or tokens per minute) is UNVERIFIED.

Body: `{ "error": { "message": "...", "type": "invalid_request_error" } }`.
400 malformed, 401 bad credentials, 403 permissions, 404, 413 too large, 422 invalid, 424 dependency failed, 429 too many requests, 498 flex tier at capacity, 499 caller cancelled, 500, 502, 503. 5xx are not charged.
Rate limits page: `retry-after` (seconds) is set only on a 429. Other headers: `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`.

## 7. Free tier limits
The rate-limits page lists for openai/gpt-oss-120b: 30 RPM, 1K RPD, 8K TPM, 200K TPD, labelled as Developer plan figures; the Free plan values are not separated in the page text. Treat as "not published" for free.

## 8. Data use
Not stated on the fetched pages. UNKNOWN: assume content may be retained (SPEC 7).

## 9. CORS from an extension service worker
Unclear. Not documented. Same note as Gemini: the Test key button verifies it (human check).
