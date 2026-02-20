# Workspace Graph UX Progress TODO

Last updated: 2026-02-19
Branch: workspace_northstart
Primary reference: /Users/buvan/Documents/GitHub/sql-crack/archive/workspace_northstar.txt
Prototype reference: /Users/buvan/Documents/GitHub/sql-crack/docs/prototypes/workspace-graph-ux-mock.html

## Current Status
- Wave 1 is implemented and validated in code.
- Wave 2 is implemented and validated in code.
- Wave 3 has started (trust copy, onboarding helper, local UX instrumentation scaffolding).
- Typecheck and full tests are green (`npx tsc --noEmit`, `npx jest --silent`).
- Hybrid mode is removed from active workspace graph behavior.

## Completed (Wave 1)
- [x] Keep only `files` and `tables` graph modes.
- [x] Remove Hybrid from settings/types/mode validation.
- [x] Add Graph context strip with mode-specific purpose copy.
- [x] Add state chips for graph state visibility.
- [x] Keep mode chip fixed (not clearable) with distinct styling.
- [x] Add inline reason text: "Graph is reduced because ...".
- [x] Simplify Graph search to query-only (remove Graph header type dropdown).
- [x] Show search count only when query is active.
- [x] Keep Graph context strip synced on view/mode/focus/trace changes.
- [x] Clean stale Hybrid references in active scripts/comments.
- [x] Update north-star text to match implemented behavior.

## Files Touched (Implementation)
- /Users/buvan/Documents/GitHub/sql-crack/package.json
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/types.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/workspacePanel.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/dependencyGraph.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/handlers/messageHandler.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/panel/graphTemplates.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/clientScripts.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/graphView.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/scripts/graphInteractions.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/scripts/viewMode.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/scripts/workspaceShell.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/scripts/contextMenu.ts
- /Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/styles/base.ts
- /Users/buvan/Documents/GitHub/sql-crack/tests/unit/workspace/handlers/messageHandler.graphMode.test.ts
- /Users/buvan/Documents/GitHub/sql-crack/tests/unit/workspace/phase1-regression.test.ts

## Pending TODO (Wave 2)
- [x] Add search next/previous result navigation in Graph.
- [x] Add jump-to-result behavior while preserving viewport continuity.
- [x] Strengthen selection action hierarchy by node type.
- [x] Ensure file-node primary action maps to "Show tables in file" flow.
- [x] Review and tighten action labels: `Trace in Lineage`, `Analyze in Impact`, `Open file`.
- [x] Verify graph-to-lineage/impact transitions are consistent from all entry points.

## Pending TODO (Wave 3)
- [x] Improve trust/freshness signaling in Graph header and quality strip.
- [x] Add first-run Graph onboarding hints with dismissible guidance.
- [x] Define feasible VS Code-safe measurement approach (opt-in/local only).
- [x] Add opt-in local UX instrumentation plumbing (`trackUxEvent` + host logger summary).
- [x] Add local metrics snapshot command surface (`sql-crack.showWorkspaceUxMetrics`) with reset action.
- [x] Add moderated usability script template (`docs/workspace-graph-usability-script.md`).
- [ ] Run usability sessions and capture confusion points/backtracking.

## Open Notes / Decisions
- `archive/workspace_northstar.txt` is currently in a git-ignored folder; keep this `docs/` file as the durable session handoff.
- Legacy UI module `/Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/graphView.ts` was partially aligned for consistency; main active rendering path is under `/Users/buvan/Documents/GitHub/sql-crack/src/workspace/panel/` and `/Users/buvan/Documents/GitHub/sql-crack/src/workspace/ui/scripts/`.

## Resume Checklist (Future Session)
1. Confirm branch: `git branch --show-current`.
2. Inspect pending diffs: `git status --short`.
3. Re-run validation before new edits.
- `npx tsc --noEmit`
- `npx jest --silent`
4. Pick next Wave 2 item and implement in small slices.
5. Update this file after each session.

## Suggested Next Task
- Run 3-5 moderated usability passes using `/Users/buvan/Documents/GitHub/sql-crack/docs/workspace-graph-usability-script.md`; capture mode backtracking, search abandonment, and Graph→Lineage/Impact conversion notes.
