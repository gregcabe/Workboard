"""Rotate the Workboard app key and MCP key. Run: Rotate-Keys.cmd

Why this is a script and not two strings in a chat: a key that has been through a chat is a key that has left
your machine. These are generated here, on your PC, written straight to the key files, and printed once on
your own screen for you to paste into the Cloudflare dashboard. Nothing is sent anywhere.

Order matters. The new key files are written FIRST, then you paste; between the paste and the page reload the
board will refuse the old key, which is the point. Old files are kept as .bak so you can put them back.

  --app   rotate only the app key
  --mcp   rotate only the MCP key
  (neither: both)
"""
import argparse, json, os, secrets, shutil, sys, datetime

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(R, "config.json"), encoding="utf-8"))
ONEDRIVE = os.path.dirname(os.path.expandvars(CFG["key_file"]))
APP_FILE = os.path.expandvars(CFG["key_file"])
MCP_FILE = os.path.expandvars(CFG.get("mcp_key_file") or os.path.join(ONEDRIVE, "workboard-mcp-key.txt"))

ap = argparse.ArgumentParser()
ap.add_argument("--app", action="store_true")
ap.add_argument("--mcp", action="store_true")
A = ap.parse_args()
do_app = A.app or not (A.app or A.mcp)
do_mcp = A.mcp or not (A.app or A.mcp)

def new_key():
    # 43 url-safe characters, 256 bits. Safe in a URL path, which is where the MCP key has to travel.
    return secrets.token_urlsafe(32)

def write(path, value):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    if os.path.exists(path):
        bak = path + "." + stamp + ".bak"
        shutil.copy2(path, bak)
        print("  kept the old one at", os.path.basename(bak))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(value)
    print("  wrote", path)

if not os.path.isdir(ONEDRIVE):
    sys.exit("Cannot find the key folder: " + ONEDRIVE + "\nCheck key_file in config.json.")

out = []
print()
if do_app:
    k = new_key(); write(APP_FILE, k); out.append(("Worker 'workboard'", "APP_KEY", k))
    out.append(("Worker 'workboard-mcp'", "APP_KEY", k))
if do_mcp:
    k = new_key(); write(MCP_FILE, k); out.append(("Worker 'workboard-mcp'", "MCP_KEY", k))

print("""
Now paste these into the Cloudflare dashboard, Workers, then Settings, Variables and Secrets.
Nothing is live until you do, and the board will refuse the old key the moment you deploy.
""")
w = max(len(a) for a, _, _ in out)
for where, name, val in out:
    print("  " + where.ljust(w) + "   " + name.ljust(8) + "  " + val)

print("""
Then, in this order:
  1. Deploy both Workers.
  2. Open the board. It will ask for the key again: paste the new APP_KEY. Everyone else on the team has to
     do the same, once, on each browser they use.""")
if do_mcp:
    print("""  3. Claude, Settings, Connectors, workboard-mcp: change the URL to
     """ + CFG["mcp_url"] + "/" + [v for _, n, v in out if n == "MCP_KEY"][0] + """
     The key travels in the path because Claude's custom-connector setup has no bearer-token field.""")
print("""  4. Run Test.cmd against the live board to prove the new key works and the old one does not:
       set WORKBOARD_URL=""" + CFG["app_url"] + """/
       set WORKBOARD_KEY=<the new app key>
  5. Delete the .bak files once the board and the connector both answer.

Do not paste these keys into a chat. If one ever goes through a chat, run this again.
""")
