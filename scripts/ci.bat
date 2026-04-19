@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Vishnu CI Pipeline
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"
set "EXIT_CODE=0"
set "BUN_EXE="

call :RESOLVE_BUN
if errorlevel 1 goto END

echo [1/7] Installing root dependencies with Bun...
call "%BUN_EXE%" install --frozen-lockfile
if errorlevel 1 (
    echo [FAIL] Bun install failed for the Vishnu root.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [2/7] Typechecking the TUI...
call "%BUN_EXE%" run lint
if errorlevel 1 (
    echo [FAIL] bun run lint failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [3/7] Running test suite...
call "%BUN_EXE%" run test
if errorlevel 1 (
    echo [FAIL] bun run test failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [4/7] Verifying the production launcher build...
call "%BUN_EXE%" run build:verify
if errorlevel 1 (
    echo [FAIL] bun run build:verify failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [5/7] Installing dashboard dependencies with Bun...
pushd "dashboard"
call "%BUN_EXE%" install --frozen-lockfile
if errorlevel 1 (
    popd
    echo [FAIL] Bun install failed for the dashboard.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [6/7] Building the production Next.js dashboard with Bun...
call "%BUN_EXE%" run build
if errorlevel 1 (
    popd
    echo [FAIL] bun run build failed for the dashboard.
    set "EXIT_CODE=1"
    goto END
)
popd

echo.
echo [7/7] Building release binaries...
call setup\rebuild.bat
if errorlevel 1 (
    echo [FAIL] setup\rebuild.bat failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [SUCCESS] CI pipeline completed.
echo Produced binaries:
echo   setup\output\vishnu-installer.exe
echo   setup\output\vishnu-installer.sh
echo Dashboard build output:
echo   dashboard\.next

:END
echo.
if /i "%VISHNU_NO_PAUSE%"=="1" exit /b %EXIT_CODE%
pause
exit /b %EXIT_CODE%

:RESOLVE_BUN
if defined BUN_EXE if exist "%BUN_EXE%" exit /b 0
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "BUN_EXE=%USERPROFILE%\.bun\bin\bun.exe"
    exit /b 0
)
for %%I in (bun.exe bun) do (
    where %%I >nul 2>nul
    if not errorlevel 1 (
        set "BUN_EXE=%%I"
        exit /b 0
    )
)
echo [FAIL] Bun was not found. Install it from https://bun.sh or run the official installer first.
set "EXIT_CODE=1"
exit /b 1
