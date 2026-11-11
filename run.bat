@echo off
echo Starting local web server...
start "" http://localhost:3000
python -m http.server 3000
pause
