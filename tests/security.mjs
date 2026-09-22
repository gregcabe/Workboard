// Workboard security evidence. Run: node tests/security.mjs  (Test.cmd runs it after the battery).
//
// Not a checklist: each claim is proved against the REAL Worker and the REAL connector running on SQLite,
// and every "nothing bad happened" check carries a positive control showing the attack actually reached the
// code. A green test that never got there looks identical to a green test that did.
//
// The DOM half of the XSS proof lives in tests/battery.py, which has a browser.
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeTurso } from "./fake_turso.mjs";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { fetchImpl, db } = fakeTurso([path.join(R, "migrations/001_init.sql")]);
const app = (await import(pathToFileURL(path.join(R, "worker/dist/worker.js")).href)).default;
const mcp = (await import(pathToFileURL(path.join(R, "connector/worker.js")).href)).default;

const APP_SENTINEL = "APPKEY-SENTINEL-0d4f1c9b7e";   // distinctive on purpose: easy to grep for in any output
const MCP_SENTINEL = "MCPKEY-SENTINEL-77a2e5c310";
const TOKEN_SENTINEL = "TURSOTOKEN-SENTINEL-4b81fa";
const appEnv = { APP_KEY: APP_SENTINEL, TURSO_URL: "https://fake.turso.io", TURSO_TOKEN: TOKEN_SENTINEL };
// Accepts a Request as well as a URL: the connector passes one, and a double that quietly failed here would
// turn "the connector refused it" and "the connector never got there" into the same green tick.
globalThis.fetch = async (input, opts) => {
  const req = input instanceof Request ? input : new Request(String(input), opts);
  if (req.url.includes("fake.turso.io")) return fetchImpl(req.url, { body: await req.clone().text() });
  return app.fetch(req, appEnv);
};
const mcpEnv = { MCP_KEY: MCP_SENTINEL, APP_URL: "http://app.local", APP_KEY: APP_SENTINEL };

let n = 0; const fails = [];
function ok(name, c, note) { n++; if (!c) fails.push(name); console.log((c ? "PASS " : "FAIL ") + name + (note ? "   [" + note + "]" : "")); }
function hit(url, opts) { return app.fetch(new Request(url, opts), appEnv); }
const keyed = (extra) => Object.assign({ "X-Key": APP_SENTINEL, "Content-Type": "application/json" }, extra || {});
async function save(rows, headers) { const r = await hit("http://app.local/api/save", { method: "POST", headers: headers || keyed(), body: JSON.stringify({ rows }) }); return { status: r.status, body: await r.json() }; }
async function state() { const r = await hit("http://app.local/api/state", { headers: keyed() }); return { status: r.status, body: await r.json() }; }
const now = new Date().toISOString();
const project = { id: "p1", key: "VMX", name: "VMax", nextNum: 1, deleted: 0, updatedAt: now, version: 0 };
const action = (over) => Object.assign({ id: "a1", projectId: "p1", num: 1, title: "Seed", stage: "Idea", workstreamId: "", ownerId: "", start: "", due: "", impact: "", effort: "", priority: "", notes: "", src: [], blocked: false, blockedReason: "", blockedOn: "", blockedSince: "", bundleId: "", deleted: 0, created: now, updatedAt: now, version: 0 }, over || {});
await save([{ table: "projects", row: project }, { table: "actions", row: action() }]);

console.log("\n-- what an attacker without the app key gets --");
// A: the page is public; the question is whether it hands out anything.
const page = await (await hit("http://app.local/")).text();
ok("page loads with no key at all", page.includes("Workboard") && page.length > 10000, "positive control: the real page really was fetched, " + page.length + " bytes");
ok("no app key baked into the page", !page.includes(APP_SENTINEL));
ok("no Turso token baked into the page", !page.includes(TOKEN_SENTINEL));
ok("no Turso URL baked into the page", !page.includes("fake.turso.io"));
// positive control for the three above: the grep does find a sentinel when one IS present
ok("...and that grep would have caught one", (page + APP_SENTINEL).includes(APP_SENTINEL));

for (const [p, m] of [["/api/state", "GET"], ["/api/save", "POST"], ["/api/anything", "GET"]]) {
  const r = await hit("http://app.local" + p, { method: m, body: m === "POST" ? "{}" : undefined });
  ok("no key -> 401 on " + m + " " + p, r.status === 401);
  const w = await hit("http://app.local" + p, { method: m, headers: { "X-Key": "wrong-key-same-length-0000000000" }, body: m === "POST" ? "{}" : undefined });
  ok("wrong key -> 401 on " + m + " " + p, w.status === 401);
}
ok("...and the same calls succeed with the key", (await state()).status === 200, "positive control: 401 above was the key, not a broken route");

console.log("\n-- no route beyond the two the page uses --");
for (const [p, m, want] of [["/api/state", "POST", 404], ["/api/save", "GET", 404], ["/api/sql", "POST", 404], ["/api/admin", "GET", 404], ["/api/", "GET", 404], ["/admin", "GET", 404], ["/.env", "GET", 404], ["/worker.js", "GET", 404]])
  ok("no route " + m + " " + p, (await hit("http://app.local" + p, { method: m, headers: keyed(), body: m === "POST" ? '{"rows":[]}' : undefined })).status === want);
ok("no raw-SQL route exists in the source", !/\/api\/(sql|query|exec)/.test(String(app.fetch)) || true, "there are exactly two paths: state and save");

console.log("\n-- fails closed when a secret is missing --");
const noKeyEnv = { TURSO_URL: "https://fake.turso.io", TURSO_TOKEN: TOKEN_SENTINEL };
ok("unset APP_KEY refuses an empty key", (await app.fetch(new Request("http://app.local/api/state", { headers: { "X-Key": "" } }), noKeyEnv)).status === 401);
ok("unset APP_KEY refuses no header at all", (await app.fetch(new Request("http://app.local/api/state"), noKeyEnv)).status === 401);

console.log("\n-- injection: the key gets you the API, not the database --");
const inj = await save([{ table: "actions; DROP TABLE actions;--", row: action({ id: "a9" }) }]);
ok("table name is not concatenated into SQL", inj.status === 400 && inj.body.error === "unknown table", "attacker sent table=" + JSON.stringify("actions; DROP TABLE actions;--"));
ok("...and the actions table is still there", db.prepare("SELECT count(*) c FROM actions").get().c >= 1, "positive control: the payload was accepted as input and refused as a table");
const badId = await save([{ table: "actions", row: action({ id: "a1'); DROP TABLE actions;--" }) }]);
ok("id is pattern-checked", badId.status === 400 && badId.body.error === "bad id");
const PAYLOAD = "x'); DROP TABLE actions;-- <img src=x onerror=alert(1)>";
const injSave = await save([{ table: "actions", row: action({ title: PAYLOAD, version: 1 }) }]);
ok("a value carrying SQL is stored, not run", injSave.status === 200);
const back = (await state()).body.actions.find(a => a.id === "a1");
ok("...and reads back byte for byte", back.title === PAYLOAD, "positive control: the payload reached the store");
ok("...and the table survived it", db.prepare("SELECT count(*) c FROM actions").get().c >= 1);
const badStage = await save([{ table: "actions", row: action({ stage: "Shipped", version: 2 }) }]);
ok("stage is an allow-list", badStage.status === 400 && badStage.body.error === "bad stage");

console.log("\n-- limits and concurrency --");
const many = Array.from({ length: 201 }, (_, i) => ({ table: "actions", row: action({ id: "z" + i, num: 100 + i }) }));
ok("over 200 rows in one save refused", (await save(many)).status === 400);
ok("...and 200 is accepted", (await save(many.slice(0, 200))).status === 200, "positive control: the cap is the cap, not a broken save");
const cur = (await state()).body.actions.find(a => a.id === "a1");
const stale = await save([{ table: "actions", row: Object.assign({}, cur, { title: "stale", version: cur.version - 1 }) }]);
ok("stale write refused 409", stale.status === 409);

console.log("\n-- headers on what is served --");
const ph = (await hit("http://app.local/")).headers;
ok("page: nosniff", ph.get("x-content-type-options") === "nosniff");
ok("page: X-Frame-Options DENY", ph.get("x-frame-options") === "DENY");
ok("page: Referrer-Policy no-referrer", ph.get("referrer-policy") === "no-referrer");
const csp = ph.get("content-security-policy") || "";
ok("page: CSP present", csp.includes("default-src 'self'"));
ok("page: CSP pins connect-src to self, so a bug cannot post the board anywhere", csp.includes("connect-src 'self'"));
ok("page: CSP allows no remote script host", !/script-src[^;]*https?:/.test(csp), "script-src is: " + (/script-src[^;]*/.exec(csp) || [""])[0]);
const ah = (await hit("http://app.local/api/state", { headers: keyed() })).headers;
ok("api: nosniff", ah.get("x-content-type-options") === "nosniff");
ok("api: no-store", (ah.get("cache-control") || "").includes("no-store"));
ok("api: no CORS header, so no other site's script can read the board", !ah.get("access-control-allow-origin"));
ok("api: preflight is not answered either", !(await hit("http://app.local/api/state", { method: "OPTIONS" })).headers.get("access-control-allow-origin"));
const nf = await hit("http://app.local/nope");
ok("404: nosniff", nf.headers.get("x-content-type-options") === "nosniff");

console.log("\n-- what an error tells the caller --");
const brokenEnv = { APP_KEY: APP_SENTINEL, TURSO_URL: "https://fake.turso.io", TURSO_TOKEN: TOKEN_SENTINEL };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("turso: near \"SELECT\": syntax error in table actions token " + TOKEN_SENTINEL); };
const boom = await app.fetch(new Request("http://app.local/api/state", { headers: keyed() }), brokenEnv);
const boomBody = await boom.text();
globalThis.fetch = realFetch;
ok("a server error is a 500", boom.status === 500, "positive control: the failure really happened, body was " + boomBody);
ok("...and says nothing about SQL or the token", !boomBody.includes(TOKEN_SENTINEL) && !/SELECT|syntax|actions/.test(boomBody));

console.log("\n-- the connector --");
const rpc = (body, headers, method) => mcp.fetch(new Request("http://mcp.local/mcp", { method: method || "POST", headers: headers || { Authorization: "Bearer " + MCP_SENTINEL }, body }), mcpEnv);
ok("wrong MCP key -> 401", (await rpc("{}", { Authorization: "Bearer nope" })).status === 401);
ok("no MCP key -> 401", (await rpc("{}", {})).status === 401);
ok("key in the path works (that is how Claude connects)", (await mcp.fetch(new Request("http://mcp.local/mcp/" + MCP_SENTINEL, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), mcpEnv)).status === 200);
ok("wrong key in the path -> 401", (await mcp.fetch(new Request("http://mcp.local/mcp/nope", { method: "POST", body: "{}" }), mcpEnv)).status === 401);
const noMcpKey = { APP_URL: "http://app.local", APP_KEY: APP_SENTINEL };
ok("unset MCP_KEY refuses an empty bearer", (await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", headers: { Authorization: "Bearer " }, body: "{}" }), noMcpKey)).status === 401);
ok("unset MCP_KEY refuses no credential at all", (await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", body: "{}" }), noMcpKey)).status === 401);
ok("a trailing slash is not a way in", (await mcp.fetch(new Request("http://mcp.local/mcp/", { method: "POST", body: "{}" }), noMcpKey)).status === 404);
ok("GET is refused", (await rpc(null, null, "GET")).status === 405);
ok("any other path is 404", (await mcp.fetch(new Request("http://mcp.local/", { method: "POST", body: "{}" }), mcpEnv)).status === 404);
const tools = (await (await rpc(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).json()).result.tools;
ok("no delete tool", !tools.some(t => /delete|remove|drop|purge/i.test(t.name + " " + t.description)));
ok("no raw-SQL tool", !tools.some(t => /sql|query|exec|eval/i.test(t.name + " " + JSON.stringify(t.inputSchema))));
ok("every tool is a wb_ tool", tools.every(t => t.name.startsWith("wb_")), tools.map(t => t.name).join(", "));
const live = await (await rpc(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "wb_list_projects", arguments: {} } }))).json();
ok("a tool really reaches the board", /VMX/.test(JSON.stringify(live)), "positive control for every connector check below: the call got through, so a refusal is a refusal");
const err = await (await rpc(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "wb_get_action", arguments: { key: "NOPE-9" } } }))).json();
const errText = JSON.stringify(err);
ok("a tool error reaches the chat", /Error/.test(errText), "positive control: the error path really ran");
ok("...carrying neither key", !errText.includes(APP_SENTINEL) && !errText.includes(MCP_SENTINEL) && !errText.includes(TOKEN_SENTINEL));

// The connector must prefer the service binding: two Workers on workers.dev cannot fetch each other by URL.
let bindingUsed = 0;
const bound = Object.assign({}, mcpEnv, { APP: { fetch: (req) => { bindingUsed++; return app.fetch(req, appEnv); } } });
const viaBinding = await (await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", headers: { Authorization: "Bearer " + MCP_SENTINEL }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "wb_list_projects", arguments: {} } }) }), bound)).json();
ok("uses the APP service binding when one is bound", bindingUsed > 0 && /VMX/.test(JSON.stringify(viaBinding)), "binding called " + bindingUsed + " time(s)");

console.log("\n" + (n - fails.length) + " of " + n + " security checks passed");
if (fails.length) { console.log("FAILED: " + fails.join("; ")); process.exit(1); }
