// Workboard MCP connector: lets any Claude chat read and write the board, through the Workboard API.
// Paste into a second Cloudflare Worker (workboard-mcp). Secrets: MCP_KEY (in the connector URL), APP_URL, APP_KEY. Binding: service binding APP -> worker "workboard".
// No delete tool and no raw SQL, by design (same rule as WCC).
const TOOLS = [
  { name: "wb_list_projects", description: "List projects with their keys.", inputSchema: { type: "object", properties: {} } },
  { name: "wb_list_actions", description: "List actions in a project. Filters: stage, owner (name), workstream (name), blocked (true), text (search).",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "project key, e.g. VMX" }, stage: { type: "string" }, owner: { type: "string" }, workstream: { type: "string" }, blocked: { type: "boolean" }, text: { type: "string" } }, required: ["project"] } },
  { name: "wb_get_action", description: "One action in full with its checklist and update log.", inputSchema: { type: "object", properties: { key: { type: "string", description: "e.g. VMX-12" } }, required: ["key"] } },
  { name: "wb_add_action", description: "Add an idea or action. Stage defaults to Idea.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, title: { type: "string" }, stage: { type: "string" }, owner: { type: "string" }, workstream: { type: "string" }, due: { type: "string" }, notes: { type: "string" }, source: { type: "string" }, who: { type: "string", description: "who is adding (a person's name)" } }, required: ["project", "title"] } },
  { name: "wb_update_action", description: "Change fields on an action: stage, owner, workstream, due, start, title, notes, blocked, blockedReason, priority, impact, effort. Logs the change.",
    inputSchema: { type: "object", properties: { key: { type: "string" }, changes: { type: "object" }, who: { type: "string" } }, required: ["key", "changes"] } },
  { name: "wb_add_update", description: "Post a note to an action's update log.", inputSchema: { type: "object", properties: { key: { type: "string" }, text: { type: "string" }, who: { type: "string" } }, required: ["key", "text"] } },
  { name: "wb_review", description: "Weekly review for a project: overdue, blocked, in play without an owner, changed since a date.", inputSchema: { type: "object", properties: { project: { type: "string" }, since: { type: "string", description: "YYYY-MM-DD" } }, required: ["project"] } },
];
const STAGES = ["Idea","Parked","Plan","Do next","Doing","Done"];
const FIELD = { stage:"Stage", ownerId:"Owner", workstreamId:"Workstream", due:"Due", start:"Start", impact:"Impact", effort:"Effort", priority:"Priority", title:"Title", notes:"Notes", blocked:"Blocked", blockedReason:"Blocked reason" };
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function safeEq(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function api(env, path, body) {
  // Prefer the service binding APP (Workers cannot fetch each other by workers.dev URL: Cloudflare error 1042).
  const f = env.APP && env.APP.fetch ? env.APP.fetch.bind(env.APP) : fetch;
  const r = await f(env.APP_URL.replace(/\/$/, "") + path, { method: body ? "POST" : "GET", headers: { "X-Key": env.APP_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
}
function byName(list, name) { if (!name) return null; const n = name.toLowerCase(); return list.find(x => x.name.toLowerCase() === n) || list.find(x => x.name.toLowerCase().startsWith(n)) || null; }
function proj(S, key) { const p = S.projects.find(p => p.key.toLowerCase() === String(key).toLowerCase() || p.name.toLowerCase() === String(key).toLowerCase()); if (!p) throw new Error("no project " + key); return p; }
function find(S, key) { const m = /^([A-Za-z]+)-(\d+)$/.exec(String(key).trim()); if (!m) throw new Error("key looks like VMX-12"); const p = proj(S, m[1]); const a = S.actions.find(a => a.projectId === p.id && a.num === Number(m[2])); if (!a) throw new Error("no action " + key); return { p, a }; }
function brief(S, a) { const p = S.projects.find(p => p.id === a.projectId), o = S.people.find(x => x.id === a.ownerId), w = S.workstreams.find(x => x.id === a.workstreamId);
  return { key: p.key + "-" + a.num, title: a.title, stage: a.stage, owner: o ? o.name : "", workstream: w ? w.name : "", due: a.due, start: a.start, priority: a.priority, impact: a.impact, effort: a.effort, blocked: !!a.blocked, blockedReason: a.blockedReason, bundle: (S.bundles.find(b => b.id === a.bundleId) || {}).name || "" }; }
function today() { return new Date().toISOString().slice(0, 10); }
async function run(env, name, args) {
  const S = await api(env, "/api/state"); const now = new Date().toISOString();
  const whoId = (byName(S.people, args.who) || {}).id || "";
  if (name === "wb_list_projects") return S.projects.map(p => ({ key: p.key, name: p.name, open: S.actions.filter(a => a.projectId === p.id && a.stage !== "Done").length }));
  if (name === "wb_list_actions") { const p = proj(S, args.project); let L = S.actions.filter(a => a.projectId === p.id);
    if (args.stage) L = L.filter(a => a.stage.toLowerCase() === args.stage.toLowerCase());
    if (args.owner) { const o = byName(S.people, args.owner); L = L.filter(a => o && a.ownerId === o.id); }
    if (args.workstream) { const w = byName(S.workstreams.filter(w => w.projectId === p.id), args.workstream); L = L.filter(a => w && a.workstreamId === w.id); }
    if (args.blocked) L = L.filter(a => a.blocked);
    if (args.text) { const t = args.text.toLowerCase(); L = L.filter(a => (a.title + " " + a.notes).toLowerCase().includes(t)); }
    return L.map(a => brief(S, a)); }
  if (name === "wb_get_action") { const { a } = find(S, args.key); return Object.assign(brief(S, a), { notes: a.notes, source: a.src, checklist: S.checklist_items.filter(c => c.actionId === a.id).map(c => ({ text: c.text, done: c.done })), log: (function(){ const gone = new Set(S.updates.filter(u => u.kind === "retract").map(u => u.text)); return S.updates.filter(u => u.actionId === a.id && u.kind !== "retract" && !gone.has(u.id)).sort((x, y) => x.at.localeCompare(y.at)).map(u => ({ at: u.at, who: (S.people.find(p => p.id === u.who) || {}).name || "", text: u.text })); })() }); }
  if (name === "wb_add_action") { const p = proj(S, args.project); const stage = args.stage && STAGES.includes(args.stage) ? args.stage : "Idea";
    const o = byName(S.people, args.owner), w = byName(S.workstreams.filter(w => w.projectId === p.id), args.workstream);
    if (args.owner && !o) throw new Error("no person named " + args.owner + "; people are " + S.people.map(x => x.name).join(", "));
    if (args.workstream && !w) throw new Error("no workstream " + args.workstream + "; workstreams are " + S.workstreams.filter(w => w.projectId === p.id).map(x => x.name).join(", "));
    const a = { id: uid("a"), projectId: p.id, num: p.nextNum, title: args.title, stage, workstreamId: w ? w.id : "", ownerId: o ? o.id : "", start: "", due: args.due || "", impact: "", effort: "", priority: "", notes: args.notes || "", src: [args.source || "Claude chat"], blocked: false, blockedReason: "", blockedOn: "", blockedSince: "", bundleId: "", deleted: 0, created: now, updatedAt: now, version: 0 };
    p.nextNum += 1; p.updatedAt = now;
    await api(env, "/api/save", { rows: [{ table: "projects", row: p }, { table: "actions", row: a }, { table: "updates", row: { id: uid("up"), actionId: a.id, at: now, who: whoId, kind: "change", text: "Created from Claude chat." } }] });
    return { added: p.key + "-" + a.num, stage, owner: o ? o.name : "", workstream: w ? w.name : "" }; }
  if (name === "wb_update_action") { const { p, a } = find(S, args.key); const ch = args.changes || {}; const lines = [];
    const set = (f, v, shown) => { if (a[f] === v) return; lines.push(FIELD[f] + ": " + (shown ? shown[0] : (a[f] === "" ? "none" : a[f])) + " → " + (shown ? shown[1] : (v === "" ? "none" : v))); a[f] = v; };
    if (ch.stage !== undefined) { if (!STAGES.includes(ch.stage)) throw new Error("stage must be one of " + STAGES.join(", ")); set("stage", ch.stage); }
    if (ch.owner !== undefined) { const o = ch.owner ? byName(S.people, ch.owner) : null; if (ch.owner && !o) throw new Error("no person named " + ch.owner); set("ownerId", o ? o.id : "", [(S.people.find(x => x.id === a.ownerId) || {}).name || "none", o ? o.name : "none"]); }
    if (ch.workstream !== undefined) { const w = ch.workstream ? byName(S.workstreams.filter(w => w.projectId === p.id), ch.workstream) : null; if (ch.workstream && !w) throw new Error("no workstream " + ch.workstream); set("workstreamId", w ? w.id : "", [(S.workstreams.find(x => x.id === a.workstreamId) || {}).name || "none", w ? w.name : "none"]); }
    for (const f of ["due", "start", "title", "notes", "priority", "impact", "effort", "blockedReason"]) if (ch[f] !== undefined) set(f, String(ch[f]));
    if (ch.blocked !== undefined) { const v = !!ch.blocked; if (a.blocked !== v) { lines.push("Blocked: " + (a.blocked ? "yes" : "no") + " → " + (v ? "yes" : "no")); a.blocked = v; a.blockedSince = v ? now : ""; if (!v) { a.blockedReason = ""; a.blockedOn = ""; } } }
    if (!lines.length) return { changed: false, key: args.key };
    a.updatedAt = now;
    await api(env, "/api/save", { rows: [{ table: "actions", row: a }, { table: "updates", row: { id: uid("up"), actionId: a.id, at: now, who: whoId, kind: "change", text: lines.join("; ") + "." } }] });
    return { changed: true, key: args.key, log: lines }; }
  if (name === "wb_add_update") { const { a } = find(S, args.key); await api(env, "/api/save", { rows: [{ table: "updates", row: { id: uid("up"), actionId: a.id, at: now, who: whoId, kind: "note", text: args.text } }] }); return { posted: true, key: args.key }; }
  if (name === "wb_review") { const p = proj(S, args.project); const L = S.actions.filter(a => a.projectId === p.id && a.stage !== "Done"); const since = args.since || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    return { overdue: L.filter(a => a.due && a.due < today()).map(a => brief(S, a)), blocked: L.filter(a => a.blocked).map(a => brief(S, a)),
      noOwner: L.filter(a => !a.ownerId && ["Plan", "Do next", "Doing"].includes(a.stage)).map(a => brief(S, a)),
      changedSince: L.filter(a => S.updates.some(u => u.actionId === a.id && u.at.slice(0, 10) >= since && u.kind !== "import" && u.kind !== "retract")).map(a => brief(S, a)) }; }
  throw new Error("unknown tool " + name);
}
function rpc(id, result, error) { return new Response(JSON.stringify(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result }), { headers: { "Content-Type": "application/json" } }); }
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The key travels in the path (https://.../mcp/<MCP_KEY>), the same arrangement as the WCC connector,
    // because Claude's custom-connector setup offers no bearer-token field. A bearer header is accepted too.
    const m = /^\/mcp(?:\/([^/]+))?$/.exec(url.pathname);
    if (!m) return new Response("Workboard MCP", { status: 404 });
    const auth = m[1] || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!safeEq(auth, env.MCP_KEY || "")) return new Response("unauthorized", { status: 401 });
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    let msg; try { msg = await request.json(); } catch { return rpc(null, null, { code: -32700, message: "parse error" }); }
    const { id, method, params } = msg;
    if (method === "initialize") return rpc(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "workboard", version: "1.0.0" } });
    if (method === "notifications/initialized" || method === "ping") return new Response(null, { status: 202 });
    if (method === "tools/list") return rpc(id, { tools: TOOLS });
    if (method === "tools/call") {
      try { const out = await run(env, params.name, params.arguments || {}); return rpc(id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }] }); }
      catch (e) { return rpc(id, { content: [{ type: "text", text: "Error: " + e.message }], isError: true }); }
    }
    return rpc(id, null, { code: -32601, message: "method not found" });
  }
};
