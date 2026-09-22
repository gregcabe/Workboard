# Workboard security sweep, 22 September 2026

Run after the build and before the grand commit, per the build method. Not a checklist: every claim below was
proved against the real Worker and the real connector running on SQLite, and every "nothing bad happened" check
carries a positive control showing the attack actually reached the code. The rig is `tests/security.mjs`
(61 checks) plus three checks in `tests/battery.py` that need a browser. Both run from `Test.cmd`.

The frame each line answers: **what does an attacker need, and what do they get.**

## What is exposed on the internet

| | |
|---|---|
| `workboard.gregcabe.workers.dev` | The page, to anyone. Everything under `/api/` needs the app key |
| `workboard-mcp.gregcabe.workers.dev/mcp/<key>` | The 7 connector tools, needs the MCP key |
| Turso | Reachable only by the workboard Worker's token. Nothing else holds it |
| `github.com/gregcabe/Workboard` | Private. Code, migrations, scripts, tests, docs. No data, no key |

## Holes looked for, and what was found

**Secrets baked into the deployed page.** None. The page is built by inlining `site/` into the Worker, so the
question is real. Proved by building the page with sentinel values for `APP_KEY`, `TURSO_TOKEN` and the Turso
URL and grepping the served bytes: absent. Positive control: the same grep finds a sentinel when one is appended,
so the search works. The page's only secret is the key the user types, which stays in their own `localStorage`.

**A route that does more than the page needs.** There are two: `GET /api/state` and `POST /api/save`. Everything
else is 404, including `/api/sql`, `/api/admin`, `/.env`, `/worker.js` and the two real paths on the wrong method.
There is no raw-SQL route and no catch-all behind the app key, which is the WCC lesson: a key meant for narrow
tools must not open a wide one.

**Unauthenticated access.** `GET /api/state`, `POST /api/save` and `GET /api/anything` all return 401 with no key
and with a wrong key of the same length. Positive control: the identical calls return 200 with the right key, so
the 401 was the key and not a broken route. The comparison is constant-time.

**Fails closed when a secret is missing.** A Worker deployed with `APP_KEY` unset refuses both an empty key and
no header at all, rather than letting everyone in. Same for the connector with `MCP_KEY` unset, on the bearer
header and on the URL path, and a trailing slash is not a way round the path match.

**SQL injection.** Values are parameterized through the libSQL pipeline; table and column names come from
`worker/tables.js` and never from the request. Proved three ways: a table name of `actions; DROP TABLE actions;--`
is refused as "unknown table" and the table is still there; an id carrying a quote and a `DROP` is refused by the
id pattern; and a title of `x'); DROP TABLE actions;-- <img src=x onerror=alert(1)>` is stored, reads back byte
for byte (positive control: it really reached the store), and the table survives.

**Cross-site scripting.** The page builds every node with `createElement` and `createTextNode`: there is no
`innerHTML`, `insertAdjacentHTML`, `eval` or `new Function` anywhere in `site/`, and the page creates no links, so
there is no URL scheme to allow-list. This matters because the page is served with `script-src 'self'
'unsafe-inline'` (its own JS is inlined), so markup that ever reached `innerHTML` would run. Proved in the
browser: an `<img onerror>` and a `<script>` payload typed into the real title field come back as visible text,
build no element, and leave the flag they would have set at 0, before and after a reload from the store.
Positive control: the payload is asserted present in the page text first, so the check is not passing on absence.

**Anything the browser could be told to send elsewhere.** The CSP pins `connect-src 'self'`, so a bug in the page
cannot post the board to another host. `script-src` names no remote host. The page carries `nosniff`,
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`; the API now carries `nosniff` and `no-store` too, and
so does the 404. The API returns no CORS header and does not answer a preflight, so no other site's script can
read the board even from a logged-in browser: the app key lives in `localStorage`, not a cookie, so there is
nothing for a cross-site request to ride on either.

**What an error tells the caller.** *Fixed in this sweep.* `/api/*` used to return the exception text on a 500,
which for a Turso failure can carry SQL and row values, to anyone holding the shared app key. The detail now goes
to the Worker log (Cloudflare dashboard, Logs) and the caller gets `{"error":"server"}`. Proved by forcing a Turso
failure whose message contains the token sentinel and asserting the response mentions neither the token nor the SQL.

**Denial of service through the API.** A save is capped at 200 rows (201 is refused, 200 is accepted, so the cap
is the cap and not a broken save). Version checks are batched one query per table, which is also what keeps the
Worker under Cloudflare's ~50 subrequest limit. A stale write is refused with 409 rather than overwriting.

**Token scope and expiry.** The Turso token is full-SQL and does not expire. The Worker does only reads and
parameterized writes with it, and nothing else holds it. Narrowing or expiring it is worth doing when Turso makes
it easy; it is recorded as feature queue item 8 rather than claimed as done.

**Where the credential files live.** All three sit in `_Claude` inside the work OneDrive, which is Revere's own
cloud tenant. Deliberate, same as WCC, and the reason none of them belongs in a chat.

**What class of data is in the store.** Improvement actions for the VMax balance-ring line: titles, owners' names,
dates, notes. No personal data beyond employee names, no customer data, no drawings. Cleared with IT before the
build.

## Knowingly accepted, with the reason

1. **The app key is one shared password for the whole team.** It authenticates the board, not the person, so
   anyone holding it can post an update as anyone. This is the single biggest gap and it is what Cloudflare
   Access closes: feature queue item 1. Until then, the "You are" picker is a convenience, not an identity.
2. **The MCP key travels in the URL path**, so it can turn up in request logs, because Claude's custom-connector
   setup has no bearer-token field. The connector accepts a bearer header too, so this reverses the day that
   changes. Treat the MCP key as the weaker of the two and rotate it more readily.
3. **`script-src 'unsafe-inline'`** is required because the page's own JS is inlined into the Worker, which is
   what keeps it a single paste-able file. The XSS proof above is what makes it safe rather than the CSP.
4. **The page loads a Google font**, so a browser opening the board tells Google it did. No board data leaves:
   `connect-src 'self'` sees to that.
5. **`safeEq` returns false on a length mismatch**, which leaks the key's length. With a 256-bit random key that
   buys an attacker nothing.

## Rotation

Both keys were rotated in this sweep because both had passed through a chat during the build. `Rotate-Keys.cmd`
generates them on the PC, writes the key files, keeps the old ones as `.bak`, and prints the new ones once for
the Cloudflare dashboard. Nothing is sent anywhere. Rotate again any time a key goes through a chat, a screen
share or an email.
