@echo off
cd /d "%~dp0"
echo Detour Notice Generator
echo Open http://127.0.0.1:5173
echo Press Ctrl+C to stop.
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:5173"
py -m http.server 5173 --bind 127.0.0.1
