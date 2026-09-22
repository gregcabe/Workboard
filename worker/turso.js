// Minimal libSQL HTTP pipeline client. Writes always go through tx(): all-or-nothing.
function arg(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
}
function cell(c) { if (!c || c.type === "null") return null; if (c.type === "integer") return Number(c.value); if (c.type === "float") return c.value; return c.value; }
export function makeDb(url, token, fetchImpl = fetch) {
  async function post(requests) {
    const r = await fetchImpl(url.replace(/\/$/, "") + "/v2/pipeline", { method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: requests.concat([{ type: "close" }]) }) });
    if (!r.ok) throw new Error("turso " + r.status);
    return r.json();
  }
  async function q(sql, args) {
    const res = (await post([{ type: "execute", stmt: { sql, args: (args || []).map(arg) } }])).results[0];
    if (res.type === "error") throw new Error(res.error.message);
    const rr = res.response.result; const cols = rr.cols.map(c => c.name);
    return rr.rows.map(row => Object.fromEntries(cols.map((c, i) => [c, cell(row[i])])));
  }
  async function tx(statements) {
    const steps = [{ stmt: { sql: "BEGIN" } }];
    statements.forEach(([sql, args], i) => steps.push({ stmt: { sql, args: (args || []).map(arg) }, condition: { type: "ok", step: i } }));
    const ci = statements.length + 1;
    steps.push({ stmt: { sql: "COMMIT" }, condition: { type: "ok", step: statements.length } });
    steps.push({ stmt: { sql: "ROLLBACK" }, condition: { type: "not", cond: { type: "ok", step: ci } } });
    const res = (await post([{ type: "batch", batch: { steps } }])).results[0];
    if (res.type === "error") throw new Error(res.error.message);
    const out = res.response.result;
    (out.step_errors || []).forEach((e, i) => { if (e) throw new Error("step " + i + ": " + e.message); });
    if (!(out.step_results || [])[ci]) throw new Error("rolled back");
    return out.step_results.slice(1, ci).map(s => s ? s.affected_row_count : 0);
  }
  return { q, tx };
}
