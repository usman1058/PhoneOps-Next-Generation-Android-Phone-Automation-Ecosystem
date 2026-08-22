@echo off
REM PhoneOps PC agent launcher.
REM Set these before running (or edit the lines below):
if "%RELAY_URL%"=="" set RELAY_URL=https://phoneops-relay.onrender.com
if "%RELAY_INTERNAL_SECRET%"=="" (
    echo RELAY_INTERNAL_SECRET is required. Set it to the same secret used by relay-service.
    pause
    exit /b 1
)
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies...
    call npm install --no-audit --no-fund || (pause & exit /b 1)
)
node agent.mjs
pause
