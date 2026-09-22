# Workboard: start here

The team action board: ideas in, actions out, nothing lost. Board / List / Matrix / Buckets / Timeline / Bundles /
My actions / Weekly review, on the same stack as WCC: a Cloudflare Worker in front of a Turso (SQLite) database,
plus an MCP connector so any Claude chat can read and write it.

Every command is a double-click. Nothing here needs admin rights.

| Double-click | Does |
|---|---|
| `Build.cmd` | Rebuilds `site/index.html` and `worker/dist/worker.js` from `site/` and `worker/` |
| `Serve-Local.cmd` | Runs the real Worker on your PC (SQLite in memory) at http://localhost:8787, key `local`. Seeds it from the brainstorm export. For trying things without touching the live board |
| `Test.cmd` | Runs the test battery (page through its real controls + the connector). Run before every push |
| `Seed-Live.cmd` | Seeds the live board from `scripts/seed/brainstorm-2026-09-22.json` through its API. Rerunnable; leaves existing rows alone |
| `Backup.cmd` | Pulls the whole live board to `backups\workboard-YYYYMMDD-HHMM.json` |
| `Restore.cmd` | Puts the live board back to the newest backup (or a file dragged onto it). Asks for YES first |
| `Push-Workboard.cmd` | Commits this folder to GitHub with `COMMIT.txt` as the message |

## First-time setup (about 20 minutes)

1. **Turso**: dashboard, create database `workboard` (same region as WCC). Open its shell and paste `migrations/001_init.sql`.
   Copy the database URL and create a token. Save the token as `%ONEDRIVE%\_Claude\workboard-turso-token.txt` (nothing else in the file).
2. **App key**: make up a long random string (30+ characters). Save it as `%ONEDRIVE%\_Claude\workboard-key.txt`. This is what the page and the scripts present to the Worker.
3. **Worker `workboard`**: Cloudflare dashboard, create a Worker, paste the whole of `worker/dist/worker.js`, deploy.
   Settings, Variables: add secrets `APP_KEY` (from step 2), `TURSO_URL`, `TURSO_TOKEN` (from step 1). Deploy again.
4. Open https://workboard.gregcabe.workers.dev, enter the app key when asked. Empty board is right at this point.
5. `Seed-Live.cmd`. Refresh the page: the 50 VMax items are there.
6. **Connector `workboard-mcp`** (optional now, recommended): second Worker, paste `connector/worker.js`, secrets `MCP_KEY` (a new random string),
   `APP_URL` = https://workboard.gregcabe.workers.dev, `APP_KEY` (same as step 2), plus Settings, Bindings, Service binding: variable `APP`, service `workboard`. Deploy.
   In Claude, Settings, Connectors, add custom connector: URL https://workboard-mcp.gregcabe.workers.dev/mcp, bearer token = `MCP_KEY`.
7. **GitHub**: private repo `workboard`. Copy this folder into the push staging folder and run the push bat, same as WCC.

`config.json` holds the two URLs so the scripts find the live board; edit it if the Worker names differ.

## Every day

Open the page. Changes save as you make them ("Saved" top right). Other people's changes appear within 30 seconds or on focus.
If the top right says the server can't be reached, keep working; it retries.

## Updating the code

Edit `site/` or `worker/`, `Build.cmd`, `Test.cmd`, then paste `worker/dist/worker.js` into the Worker again and push the repo.
The connector changes rarely; paste `connector/worker.js` when it does.

## Read next

`HANDOFF.md` (for a new chat), `docs/SYSTEM-MAP.html` (what runs where), `docs/FEATURE-QUEUE.md` (decided, not built).
