// Exercises the connector against the real Worker on SQLite (no network). Run: node tests/connector.test.mjs
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeTurso } from "./fake_turso.mjs";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { fetchImpl } = fakeTurso([path.join(R, "migrations/001_init.sql")]);
const app = (await import(pathToFileURL(path.join(R, "worker/dist/worker.js")).href)).default;
const mcp = (await import(pathToFileURL(path.join(R, "connector/worker.js")).href)).default;
const appEnv = { APP_KEY: "k", TURSO_URL: "https://fake.turso.io", TURSO_TOKEN: "t" };
globalThis.fetch = async (url, opts) => { const u = String(url); if (u.includes("fake.turso.io")) return fetchImpl(u, opts); return app.fetch(new Request(u, opts), appEnv); };
const env = { MCP_KEY: "m", APP_URL: "http://app.local", APP_KEY: "k" };
// seed: one project, two people, one workstream through the API
const now = new Date().toISOString();
await app.fetch(new Request("http://app.local/api/save", { method: "POST", headers: { "X-Key": "k" }, body: JSON.stringify({ rows: [
  { table: "projects", row: { id: "p1", key: "VMX", name: "VMax", nextNum: 1, deleted: 0, updatedAt: now, version: 0 } },
  { table: "people", row: { id: "u1", name: "Ciara Barber", kind: "person", email: "", deleted: 0, updatedAt: now, version: 0 } },
  { table: "workstreams", row: { id: "w1", projectId: "p1", name: "Leak testing", color: "#000", ord: 1, deleted: 0, updatedAt: now, version: 0 } } ] }) }), appEnv);
let n = 0, id = 0; const fails = [];
async function call(name, args) { const r = await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", headers: { Authorization: "Bearer m" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }), env); const j = await r.json(); const t = j.result.content[0].text; return j.result.isError ? { error: t } : JSON.parse(t); }
function ok(name, c) { n++; if (!c) fails.push(name); console.log((c ? "PASS " : "FAIL ") + name); }
ok("unauthorized 401", (await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", headers: { Authorization: "Bearer x" }, body: "{}" }), env)).status === 401);
ok("wrong path key 401", (await mcp.fetch(new Request("http://mcp.local/mcp/nope", { method: "POST", body: "{}" }), env)).status === 401);
ok("path key works", (await (await mcp.fetch(new Request("http://mcp.local/mcp/m", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) }), env)).json()).result.tools.length === 7);
const lst = await (await mcp.fetch(new Request("http://mcp.local/mcp", { method: "POST", headers: { Authorization: "Bearer m" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env)).json();
ok("7 tools, no delete", lst.result.tools.length === 7 && !lst.result.tools.some(t => /delete/i.test(t.name)));
const add = await call("wb_add_action", { project: "VMX", title: "Order seals", owner: "ciara", workstream: "leak", who: "Ciara Barber" });
ok("add -> VMX-1", add.added === "VMX-1" && add.owner === "Ciara Barber");
const add2 = await call("wb_add_action", { project: "VMX", title: "Second" });
ok("numbers advance", add2.added === "VMX-2");
ok("unknown owner refused", (await call("wb_add_action", { project: "VMX", title: "x", owner: "Nobody" })).error);
const up = await call("wb_update_action", { key: "VMX-1", changes: { stage: "Doing", blocked: true, blockedReason: "Needs downtime" }, who: "Ciara Barber" });
ok("update logs stage, reason and blocked", up.changed && up.log.length === 3);
await call("wb_add_update", { key: "VMX-1", text: "Called the vendor", who: "Ciara Barber" });
const g = await call("wb_get_action", { key: "VMX-1" });
ok("get shows stage, blocked, log", g.stage === "Doing" && g.blocked && g.log.some(l => l.text === "Called the vendor") && g.log[0].who === "Ciara Barber");
const rv = await call("wb_review", { project: "VMX" });
ok("review blocked=1 noOwner=0", rv.blocked.length === 1 && rv.noOwner.length === 0);
ok("bad stage refused", (await call("wb_update_action", { key: "VMX-1", changes: { stage: "Whatever" } })).error);
console.log(`${n - fails.length} of ${n} checks passed`); process.exit(fails.length ? 1 : 0);
