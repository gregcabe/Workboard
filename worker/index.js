// Workboard Worker: serves the page and a small JSON API in front of Turso.
// Browsers hold APP_KEY (in localStorage); only this Worker holds the Turso token.
import { TABLES, toRow, fromRow } from "./tables.js";
import { makeDb } from "./turso.js";
const PAGE = __PAGE__;  // site/index.html is inlined here by scripts/build.py
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const SEC = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'" };
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: HEADERS }); }
function safeEq(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export function validateRow(table, row) {
  const t = TABLES[table]; if (!t) return "unknown table";
  if (!row || typeof row !== "object") return "row missing";
  if (!ID.test(String(row.id || ""))) return "bad id";
  if (t.appendOnly) return null;
  if (!Number.isInteger(row.version) || row.version < 0) return "version missing";
  if (table === "actions" && !["Idea","Parked","Plan","Do next","Doing","Done"].includes(row.stage)) return "bad stage";
  return null;
}
export async function loadState(db) {
  const out = {};
  for (const table of Object.keys(TABLES)) {
    const rows = await db.q("SELECT * FROM " + table + (TABLES[table].appendOnly ? "" : " WHERE deleted=0"));
    out[table] = rows.map(r => fromRow(table, r));
  }
  return out;
}
export async function saveRows(db, items, now) {
  // One version query per table (Workers allow ~50 subrequests per request), then one transaction for everything.
  for (const it of items) { const err = validateRow(it.table, it.row); if (err) return { error: err, table: it.table, id: it.row && it.row.id, status: 400 }; }
  const current = {};
  for (const table of Object.keys(TABLES)) {
    if (TABLES[table].appendOnly) continue;
    const ids = Array.from(new Set(items.filter(i => i.table === table).map(i => String(i.row.id))));
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = await db.q("SELECT id, version FROM " + table + " WHERE id IN (" + chunk.map(() => "?").join(",") + ")", chunk);
      rows.forEach(r => { current[table + "/" + r.id] = r.version; });
    }
  }
  const stmts = [], newVersions = [];
  for (const it of items) {
    const t = TABLES[it.table]; const r = toRow(it.table, it.row);
    if (t.appendOnly) { stmts.push(["INSERT OR IGNORE INTO " + it.table + " (" + t.cols.join(",") + ") VALUES (" + t.cols.map(() => "?").join(",") + ")", t.cols.map(c => r[c])]); continue; }
    const cur = current[it.table + "/" + r.id];
    if (cur !== undefined && cur !== r.version) return { error: "conflict", table: it.table, id: r.id, current: cur, status: 409 };
    r.version = (cur !== undefined ? r.version : 0) + 1; r.updated_at = now;
    newVersions.push({ table: it.table, id: r.id, version: r.version });
    if (cur !== undefined) stmts.push(["UPDATE " + it.table + " SET " + t.cols.filter(c => c !== "id").map(c => c + "=?").join(",") + " WHERE id=? AND version=?", t.cols.filter(c => c !== "id").map(c => r[c]).concat([r.id, r.version - 1])]);
    else stmts.push(["INSERT INTO " + it.table + " (" + t.cols.join(",") + ") VALUES (" + t.cols.map(() => "?").join(",") + ")", t.cols.map(c => r[c])]);
  }
  if (stmts.length) await db.tx(stmts);
  return { ok: true, versions: newVersions };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html")
      return new Response(PAGE, { headers: Object.assign({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }, SEC) });
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!safeEq(request.headers.get("X-Key") || "", env.APP_KEY || "")) return json({ error: "unauthorized" }, 401);
    const db = makeDb(env.TURSO_URL, env.TURSO_TOKEN);
    try {
      if (url.pathname === "/api/state" && request.method === "GET") return json(await loadState(db));
      if (url.pathname === "/api/save" && request.method === "POST") {
        const body = await request.json(); if (!Array.isArray(body.rows) || body.rows.length > 200) return json({ error: "bad request" }, 400);
        const res = await saveRows(db, body.rows, new Date().toISOString());
        return json(res, res.status || 200);
      }
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: "server", detail: String(e.message || e) }, 500); }
  }
};
