@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Vishnu Stable Updater
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"

node scripts\js\update.js --verbose
set "EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %EXIT_CODE%
