@echo off
cd /d "%~dp0"
set NODE=node
if exist "%ONEDRIVE%\_Claude\node-path.txt" for /f "usebackq delims=" %%p in ("%ONEDRIVE%\_Claude\node-path.txt") do set "NODE=%%p\node.exe"
for %%d in ("%NODE%") do set "PATH=%%~dpd;%PATH%"
python tests\battery.py
"%NODE%" tests\connector.test.mjs
pause
