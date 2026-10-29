# Provider docs (you do this before Phase 3)

Claude Code must build the providers from facts, not memory. API details change often, and the current Gemini documentation uses newer endpoints than older tutorials show. So before Phase 3, put the exact current details in these files:
- docs/providers/gemini.md
- docs/providers/groq.md

If either file is missing or incomplete, the Phase 3 prompt makes Claude Code stop and say what is missing.

## What each file must contain (copy from the provider's official docs)
1. The REST endpoint URL for one text request, and the HTTP method.
2. How the key is sent (header name or query parameter). Show the shape only, with `YOUR_KEY` as a placeholder.
3. One full request example with a system instruction and a user message.
4. The parameter that forces structured JSON output (with a schema if the API supports it), exactly as the docs show it.
5. One full response example, and the path to the text of the answer.
6. The model ids you want to use as defaults, and where the docs list them.
7. The error response shape for 401 or 403, 429 (with any retry-after header), quota exhausted, and 5xx.
8. The free tier limits that the docs state (requests per minute, per day, tokens). If the docs do not state them, write "not published".
9. One line on data use: whether free-tier prompts may be used to improve the provider's products. Quote the docs.
10. Whether a browser extension service worker can call the endpoint directly (CORS) according to the docs. If unclear, write "unclear", and Phase 3 will test it in the human check.

Tip: paste the relevant doc pages into the file as plain text. Do not paste any real key. Do not paste anything with your account details.

## Getting your developer key
1. Open Google AI Studio and create a key for a new project.
2. Restrict the key to the Gemini API only, in the key settings.
3. For Groq, create a key in the Groq console.
4. In the project folder create a file named `.env.local` with these lines:
```
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```
5. `.env.local` is gitignored. Only the bake-off script reads it, and it never prints keys.

## Key hygiene
- Never paste a key into a chat, an issue, a screenshot or a commit.
- This developer key is for your own testing only. The extension itself never contains a key: each user adds their own in the options page, and it stays in their own browser.
- If a key ever leaks (shared by mistake, shown in a log, committed), delete it in the console right away and create a new one. Then run `git log -p | grep -E "AIza|gsk_"` to see whether it was committed.
- Google's current rule is that keys must not be hardcoded in client apps. That is why this product is bring-your-own-key and has no shared key.

## Later providers
xAI (Grok) and OpenRouter can be added after the first release by adding a docs/providers/<name>.md file and a provider module that follows the same interface. Do not add them in the first release.
