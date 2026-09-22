@echo off
cd /d "%~dp0"
python scripts\seed.py --config config.json --file scripts\seed\brainstorm-2026-09-22.json
pause
