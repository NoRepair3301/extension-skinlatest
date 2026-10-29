# Skinly AI (working name)

Chromium extension (Chrome, Edge, Brave). Click "Change my page" on a site you choose. A local analyser describes the page layout (no text, links or forms), the AI provider you chose returns a style plan, and the extension checks it and applies it. Plans can be remembered per site. Free plan: 5 built-in themes, bring your own API key.

Not affiliated with any website.

## Start (Windows PowerShell)
1. Create a new empty folder, for example `D:\Projects\skinly-ai`, and copy everything from this pack into it (keep the `docs` folder).
2. `git init`, then `git add .` and `git commit -m "docs: rules and phase docs"`.
3. Read `PROMPTS.md`. Start Phase 0 in Claude Code with `/model sonnet` and `/effort medium`.
4. Before Phase 1, capture the fixtures (docs/tools/capture-fixture.md). Before Phase 3, add the provider docs (docs/providers/README.md).

## Files
`CLAUDE.md` rules | `docs/SPEC.md` contracts | `docs/PHASE_0..9.md` phases | `docs/AUDIT.md` audits | `docs/GIT_WORKFLOW.md` git and token rules | `PROMPTS.md` prompts.
