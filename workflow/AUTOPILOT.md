# AUTOPILOT control file (edit on GitHub; the runs read it every time)

Save as `workflow/AUTOPILOT.md` on the `repaint-build` branch.

## Switches
halt: false
include_browser_harness: false

## Pause after these stages (the run sets `halt: true` itself; you change it back to `false` to continue)
pause_after: S2.1

Suggested later: `pause_after: S2.1, S2.4, S4.5, S5.4, S6.6` to stop at milestones for your own manual test in Chrome. Delete the line's contents (`pause_after:`) to run straight through.

## Tier overrides (which routine runs the stage: opus or sonnet)
S2.1: sonnet

Default tier comes from the model column in workflow/PLAN.md (Opus -> opus, Sonnet or Haiku -> sonnet). Add a line like `S5.2: sonnet` to run an Opus stage on Sonnet (cheaper, lower quality).

## Prompt overrides (task file used instead of prompts/<ID>.md)
S2.1: prompts/S2.1-reapply.md

## Notes for the owner
- Stop everything: set `halt: true` here, or switch both scheduled tasks off at claude.ai/code/routines.
- A BLOCKED row in workflow/PLAN.md also stops everything; read workflow/HANDOFF.md and workflow/failed/ for the reason.
- Work lands only on branch `repaint-build`. `main` is untouched until you open a pull request yourself.
- Any stage commit can be tagged later; the commit hashes are in workflow/LOG.md.
