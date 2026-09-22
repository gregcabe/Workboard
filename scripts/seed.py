"""Seed a Workboard instance from an export file, through its own API.
Rerunnable: rows that already exist (matched on id, and actions on project key + number) are left alone
unless --overwrite is given. Never deletes.
  python scripts/seed.py --url https://workboard.gregcabe.workers.dev --key-file "%ONEDRIVE%\\_Claude\\workboard-key.txt" --file scripts/seed/brainstorm-2026-09-22.json
"""
import argparse,json,sys,urllib.request,datetime
ap=argparse.ArgumentParser();ap.add_argument("--url");ap.add_argument("--config",help="read app_url and key_file from config.json");ap.add_argument("--key");ap.add_argument("--key-file");ap.add_argument("--file",required=True);ap.add_argument("--overwrite",action="store_true")
A=ap.parse_args()
import os
if A.config:
    cfg=json.load(open(A.config,encoding="utf-8"));A.url=A.url or cfg["app_url"];A.key_file=A.key_file or os.path.expandvars(cfg["key_file"])
if not A.url: sys.exit("need --url or --config")
key=A.key or open(A.key_file,encoding="utf-8-sig").read().strip()
print("target",A.url,"key length",len(key))
def call(path,method="GET",body=None):
    r=urllib.request.Request(A.url.rstrip("/")+path,method=method,data=json.dumps(body).encode() if body else None,headers={"X-Key":key,"Content-Type":"application/json","User-Agent":"Workboard-scripts/1.0"})
    try:
        with urllib.request.urlopen(r,timeout=60) as resp: raw=resp.read();status=resp.status
    except urllib.error.HTTPError as e: raw=e.read();status=e.code
    try: return status,json.loads(raw or b"{}")
    except ValueError: sys.exit("HTTP %s from %s, not JSON. First 400 chars:\n%s"%(status,path,raw[:400].decode("utf-8","replace")))
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
st,state=call("/api/state")
if st!=200: sys.exit("state failed: %s %s"%(st,state))
seed=json.load(open(A.file,encoding="utf-8"))
def norm_common(r): r.setdefault("deleted",0); r["updatedAt"]=r.get("updatedAt") or now; return r
rows=[];skipped=0
def plan(table,r,match):
    global skipped
    cur=match
    if cur and not A.overwrite: skipped+=1; return
    r=dict(r); r["version"]=cur["version"] if cur else 0
    rows.append({"table":table,"row":r})
byid=lambda t:{x["id"]:x for x in state.get(t,[])}
for p in seed.get("projects",[]):
    p=norm_common(dict(p)); m=byid("projects").get(p["id"]) or next((x for x in state["projects"] if x["key"]==p["key"]),None)
    if m: p["id"]=m["id"]; p["nextNum"]=max(m["nextNum"],p["nextNum"])
    plan("projects",p,m)
for t in ("people","workstreams","bundles"):
    for r in seed.get(t,[]):
        r=norm_common(dict(r)); r.setdefault("kind","person"); r.setdefault("email",""); r.setdefault("ord",0); r.setdefault("notes","")
        m=byid(t).get(r["id"]) or next((x for x in state.get(t,[]) if x["name"].lower()==r["name"].lower()),None)
        if m: r["id"]=m["id"]
        plan(t,r,m)
keyof={p["id"]:p["key"] for p in seed.get("projects",[])}
existing={(a["projectId"],a["num"]):a for a in state.get("actions",[])}
for a in seed.get("actions",[]):
    a=norm_common(dict(a)); a.pop("checklist",None); a.setdefault("start",""); a.setdefault("blocked",False); a.setdefault("blockedReason",""); a.setdefault("blockedOn",""); a.setdefault("blockedSince",""); a.setdefault("bundleId","")
    if "updated" in a: a["updatedAt"]=a.pop("updated")
    m=existing.get((a["projectId"],a["num"]))
    if m: a["id"]=m["id"]
    plan("actions",a,m)
have=byid("updates")
for u in seed.get("updates",[]):
    if u["id"] in have: skipped+=1; continue
    rows.append({"table":"updates","row":u})
for i in range(0,len(rows),150):
    st,res=call("/api/save","POST",{"rows":rows[i:i+150]})
    if st!=200: sys.exit("save failed: %s %s"%(st,res))
print("seeded %d rows, left %d existing rows alone"%(len(rows),skipped))
