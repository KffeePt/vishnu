@echo off
setlocal

cd /d "%~dp0"

echo Running secure Firebase claims tool from repo root...
node "scripts\set_claims.js" %*
set "exit_code=%errorlevel%"

if not "%exit_code%"=="0" (
  echo.
  echo set_claims failed with exit code %exit_code%.
)

echo.
pause
exit /b %exit_code%
