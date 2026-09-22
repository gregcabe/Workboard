# Workboard: handoff for a new chat

Read this first. It holds what cannot be recovered by reading the code.

## What it is
Team action board for RPS improvement projects (first: VMax 2.0 balance ring). Ideas and actions are one record that moves
through stages Idea / Parked / Plan / Do next / Doing / Done. Each carries workstream, owner, start, due, impact, effort,
priority (calculated from impact and effort, or set by hand), a blocked flag with reason and an optional "waiting on" action,
a bundle (work done together, e.g. one downtime window), a checklist, source tags, notes, and an append-only update log.
Built 22 Sep 2026 from a brainstorm prototype; the Excel-era WCC pattern reused deliberately.

## Constraints that shaped it
- Same stack as WCC: Cloudflare Worker + Turso + private GitHub repo + MCP connector. Greg pastes Workers by hand; Claude never assumes a stage is a deploy.
- Browsers hold only the app key (localStorage `workboard.local`). Only the Worker holds the Turso token. That is WCC open item 1 done from day one.
- No hard deletes anywhere: `deleted=1` on rows, and the connector has no delete tool. Updates are append-only.
- Every row has `version`; the API refuses a stale write with 409 and the page reloads.
- One owner per action. Companies (ONC, Darl) are `people.kind='company'`.
- Per-viewer settings (tab, collapsed rows, "You are") stay in the browser, never in the shared store.
- No formal dependencies. Blocked + "waiting on" + bundles cover the need; a dependency engine was rejected as overbuilding.
- Cloudflare Access (who-is-logged-in identity) is deferred: FEATURE-QUEUE item 1. Until then "You are" is a picker.
- Data classification check with IT: done by Greg, cleared.

## Architecture screen
Page (site/) -> /api/state, /api/save on the Worker (worker/) -> Turso via /v2/pipeline.
Connector (connector/) -> the same /api on the Worker, never Turso directly.
Scripts (seed, backup) -> the same /api. Tests run the real Worker on node:sqlite (tests/fake_turso.mjs).

## Read these first, in order
1. START-HERE.md  2. migrations/001_init.sql  3. worker/tables.js (the table contract)  4. worker/index.js  5. site/app.js
6. tests/battery.py (what "working" means)  7. docs/FEATURE-QUEUE.md

## Rules learned on this build
- The page's data layer saves by diffing rows against a snapshot; snapshot only after a successful save. Never re-render the drawer from the save callback (it steals focus mid-typing).
- Test what ships: the battery rebuilds worker/dist first and kills nothing; if a stale local server is on the test port the run tests old code. Check the port before believing a failure.
- A global find-and-replace on an identifier once turned a helper into a self-call. Grep for `function x(){return x(` after any rename.

## Open items
See docs/FEATURE-QUEUE.md. Post-build sweep (spring clean + security sweep + system map refresh) is due before the grand commit.
- Windows: `import()` in node needs `pathToFileURL(...).href`, a bare path fails with ERR_UNSUPPORTED_ESM_URL_SCHEME. Fixed 22 Sep.
- Diff-save race: a row changed while a save was in flight was marked saved and lost. The snapshot now covers only the rows sent. Fixed 22 Sep; the battery's checklist step is the regression test.
- Node on Greg's PC is the portable build; launchers read its folder from `_Claude\node-path.txt`, like `git-path.txt`.
