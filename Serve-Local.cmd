@echo off
cd /d "%~dp0"
set NODE=node
if exist "%ONEDRIVE%\_Claude\node-path.txt" for /f "usebackq delims=" %%p in ("%ONEDRIVE%\_Claude\node-path.txt") do set "NODE=%%p\node.exe"
python scripts\build.py
start "Workboard local" "%NODE%" tests\local_server.mjs 8787
timeout /t 2 >nul
python scripts\seed.py --url http://localhost:8787 --key local --file scripts\seed\brainstorm-2026-09-22.json
start http://localhost:8787/
echo Key is: local   (close the "Workboard local" window to stop)
pause
