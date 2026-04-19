@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"

node scripts\js\set_claims.js %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo set_claims failed with exit code %EXIT_CODE%.
)

echo.
pause
exit /b %EXIT_CODE%
