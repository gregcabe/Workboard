@echo off
cd /d "%~dp0"
echo This puts the live board back to a backup file. Existing rows are overwritten; nothing is deleted.
if "%~1"=="" (
  for /f "delims=" %%f in ('dir /b /o-d backups\workboard-*.json 2^>nul') do (set "FILE=backups\%%f" & goto pick)
  echo No backup found in backups\. Drag a backup file onto this launcher to use a specific one.
  pause & exit /b 1
)
set "FILE=%~1"
:pick
echo Restoring from: %FILE%
set /p OK=Type YES to continue: 
if /i not "%OK%"=="YES" (echo Canceled. & pause & exit /b 1)
python scripts\seed.py --config config.json --overwrite --file "%FILE%"
pause
