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

echo [1/11] Installing root dependencies with Bun...
call "%BUN_EXE%" install --frozen-lockfile
if errorlevel 1 (
    echo [FAIL] Bun install failed for the Vishnu root.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [2/11] Typechecking the TUI...
call "%BUN_EXE%" run lint
if errorlevel 1 (
    echo [FAIL] bun run lint failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [3/11] Running test suite...
call "%BUN_EXE%" run test
if errorlevel 1 (
    echo [FAIL] bun run test failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [4/11] Verifying the production launcher build...
call "%BUN_EXE%" run build:verify
if errorlevel 1 (
    echo [FAIL] bun run build:verify failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [5/11] Installing dashboard dependencies with Bun...
pushd "dashboard"
call "%BUN_EXE%" install --frozen-lockfile
if errorlevel 1 (
    popd
    echo [FAIL] Bun install failed for the dashboard.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [6/11] Building the production Next.js dashboard with Bun...
call "%BUN_EXE%" run build
if errorlevel 1 (
    popd
    echo [FAIL] bun run build failed for the dashboard.
    set "EXIT_CODE=1"
    goto END
)
popd

echo.
echo [7/11] Installing Functions dependencies with Bun...
pushd "functions"
call "%BUN_EXE%" install --frozen-lockfile
if errorlevel 1 (
    popd
    echo [FAIL] Bun install failed for Cloud Functions.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [8/11] Linting Cloud Functions...
call "%BUN_EXE%" run lint
if errorlevel 1 (
    popd
    echo [FAIL] bun run lint failed for Cloud Functions.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [9/11] Building Cloud Functions...
call "%BUN_EXE%" run build
if errorlevel 1 (
    popd
    echo [FAIL] bun run build failed for Cloud Functions.
    set "EXIT_CODE=1"
    goto END
)
popd

echo.
echo [10/11] Building release binaries...
call setup\rebuild.bat
if errorlevel 1 (
    echo [FAIL] setup\rebuild.bat failed.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [11/11] Staging release assets...
call "%BUN_EXE%" scripts\js\stage_release_assets.js
if errorlevel 1 (
    echo [FAIL] Failed to stage release assets into bin\release.
    set "EXIT_CODE=1"
    goto END
)

echo.
echo [SUCCESS] CI pipeline completed.
echo Produced binaries:
echo   setup\output\vishnu-installer.exe
echo   setup\output\vishnu-installer.sh
echo Staged release assets:
echo   bin\release
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
