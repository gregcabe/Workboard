// One home for the table contract: the Worker, the connector and the tests all import this.
export const TABLES = {
  projects:   { cols: ["id","key","name","next_num","deleted","updated_at","version"], map: {nextNum:"next_num",updatedAt:"updated_at"} },
  people:     { cols: ["id","name","kind","email","deleted","updated_at","version"], map: {updatedAt:"updated_at"} },
  workstreams:{ cols: ["id","project_id","name","color","ord","deleted","updated_at","version"], map: {projectId:"project_id",updatedAt:"updated_at"} },
  bundles:    { cols: ["id","project_id","name","date","notes","deleted","updated_at","version"], map: {projectId:"project_id",updatedAt:"updated_at"} },
  actions:    { cols: ["id","project_id","num","title","stage","workstream_id","owner_id","start","due","impact","effort","priority","notes","src_json","blocked","blocked_reason","blocked_on","blocked_since","bundle_id","deleted","created_at","updated_at","version"],
                map: {projectId:"project_id",workstreamId:"workstream_id",ownerId:"owner_id",src:"src_json",blockedReason:"blocked_reason",blockedOn:"blocked_on",blockedSince:"blocked_since",bundleId:"bundle_id",created:"created_at",updatedAt:"updated_at"} },
  checklist_items:{ cols: ["id","action_id","text","done","ord","deleted","updated_at","version"], map: {actionId:"action_id",updatedAt:"updated_at"} },
  updates:    { cols: ["id","action_id","at","who","kind","text"], map: {actionId:"action_id"}, appendOnly: true },
};
export const STAGES = ["Idea","Parked","Plan","Do next","Doing","Done"];
const INTCOLS = new Set(["next_num","num","deleted","blocked","done","ord","version"]);
function keyFor(t, c) { return Object.keys(t.map).find(k => t.map[k] === c) || c; }
export function toRow(table, obj) {
  const t = TABLES[table]; const out = {};
  for (const c of t.cols) {
    let v = obj[keyFor(t, c)]; if (v === undefined) v = obj[c];
    if (c === "src_json") v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (INTCOLS.has(c)) v = v === true ? 1 : v === false ? 0 : (v == null || v === "" ? 0 : Number(v));
    else v = v == null ? "" : String(v);
    out[c] = v;
  }
  return out;
}
export function fromRow(table, row) {
  const t = TABLES[table]; const out = {};
  for (const c of t.cols) {
    let v = row[c];
    if (c === "src_json") { try { v = JSON.parse(v || "[]"); } catch { v = []; } }
    else if (c === "blocked" || c === "done") v = !!v;
    out[keyFor(t, c)] = v;
  }
  return out;
}
