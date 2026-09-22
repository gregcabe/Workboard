"""Builds site/index.html (page) and worker/dist/worker.js (single file to paste into the Cloudflare dashboard).
Run: python scripts/build.py   (or Build.cmd)"""
import os,re,json,hashlib
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(R,p),encoding="utf-8").read()
def wr(p,s): os.makedirs(os.path.dirname(os.path.join(R,p)),exist_ok=True); open(os.path.join(R,p),"w",encoding="utf-8").write(s)
page=rd("site/index.tpl.html").replace("__CSS__",rd("site/app.css")).replace("__JS__",rd("site/app.js"))
wr("site/index.html",page)
def mod(p):  # strip ESM import/export so the three modules concatenate into one classic script
    s=rd(p); s=re.sub(r'^import .*?;\n','',s,flags=re.M); s=re.sub(r'^export default ','const WORKER = ',s,flags=re.M); s=re.sub(r'^export ','',s,flags=re.M); return s
w="// Workboard Worker, built by scripts/build.py. Do not edit here; edit worker/*.js and rebuild.\n"+mod("worker/tables.js")+"\n"+mod("worker/turso.js")+"\n"+mod("worker/index.js").replace("__PAGE__",json.dumps(page))+"\nexport default WORKER;\n"
wr("worker/dist/worker.js",w)
print("site/index.html",len(page),"bytes; worker/dist/worker.js",len(w),"bytes; page sha256",hashlib.sha256(page.encode()).hexdigest()[:12])
