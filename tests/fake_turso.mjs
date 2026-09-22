// A local stand-in for Turso: real SQLite (node:sqlite) behind the same /v2/pipeline JSON contract.
// Lets the REAL Worker run locally, so the battery tests the code that ships, not a copy of it.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
export function fakeTurso(migrationPaths) {
  const db = new DatabaseSync(":memory:");
  for (const p of migrationPaths) db.exec(fs.readFileSync(p, "utf8"));
  const val = a => a.type === "null" ? null : a.type === "integer" ? Number(a.value) : a.type === "float" ? a.value : a.value;
  const cellOut = v => v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : { type: "text", value: String(v) };
  function exec(stmt) {
    const args = (stmt.args || []).map(val);
    const s = db.prepare(stmt.sql);
    if (/^\s*(select|pragma|with)/i.test(stmt.sql)) {
      const rows = s.all(...args); const cols = rows.length ? Object.keys(rows[0]) : (s.columns ? s.columns().map(c => c.name) : []);
      return { cols: cols.map(name => ({ name })), rows: rows.map(r => cols.map(c => cellOut(r[c]))), affected_row_count: 0 };
    }
    const r = s.run(...args); return { cols: [], rows: [], affected_row_count: Number(r.changes) };
  }
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body); const results = [];
    for (const req of body.requests) {
      if (req.type === "close") { results.push({ type: "ok", response: { type: "close" } }); continue; }
      if (req.type === "execute") { try { results.push({ type: "ok", response: { type: "execute", result: exec(req.stmt) } }); } catch (e) { results.push({ type: "error", error: { message: e.message } }); } continue; }
      const step_results = [], step_errors = [];
      for (const st of req.batch.steps) {
        const c = st.condition; let run = true;
        if (c) { const okAt = i => !!step_results[i] && !step_errors[i]; run = c.type === "ok" ? okAt(c.step) : c.type === "not" ? !okAt(c.cond.step) : true; }
        if (!run) { step_results.push(null); step_errors.push(null); continue; }
        try { step_results.push(exec(st.stmt)); step_errors.push(null); } catch (e) { step_results.push(null); step_errors.push({ message: e.message }); }
      }
      results.push({ type: "ok", response: { type: "batch", result: { step_results, step_errors } } });
    }
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  return { db, fetchImpl };
}
