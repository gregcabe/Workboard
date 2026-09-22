"""Backup the live board to backups/workboard-YYYYMMDD-HHMM.json (the same shape /api/state returns).
Restore = seed.py --overwrite --file <backup>."""
import json,os,urllib.request,datetime
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg=json.load(open(os.path.join(R,"config.json")))
key=open(os.path.expandvars(cfg["key_file"]),encoding="utf-8-sig").read().strip()
r=urllib.request.Request(cfg["app_url"].rstrip("/")+"/api/state",headers={"X-Key":key,"User-Agent":"Workboard-scripts/1.0"})
data=json.loads(urllib.request.urlopen(r,timeout=60).read())
os.makedirs(os.path.join(R,"backups"),exist_ok=True)
p=os.path.join(R,"backups","workboard-"+datetime.datetime.now().strftime("%Y%m%d-%H%M")+".json")
json.dump(data,open(p,"w",encoding="utf-8"),indent=1)
print("wrote",p,{k:len(v) for k,v in data.items()})
