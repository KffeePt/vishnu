@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Vishnu CD Pipeline
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
cd /d "%ROOT_DIR%"
set "EXIT_CODE=0"
set "BUN_EXE="
set "VER_INPUT="
set "LATEST_TAG="
set "CHANNEL_INPUT="
set "ITERATION_INPUT="
set "TAG="
set "COMMIT_MESSAGE="

cls
echo  __    __   __     ______     __  __     __   __     __  __
echo /\ \  / /  /\ \   /\  ___\   /\ \_\ \   /\ "-.\ \   /\ \/\ \
echo \ \ \' /   \ \ \  \ \___  \  \ \  __ \  \ \ \-.  \  \ \ \_\ \
echo  \ \__/     \ \_\  \/\_____\  \ \_\ \_\  \ \_\\"\_\  \ \_____\
echo   \/_/       \/_/   \/_____/   \/_/\/_/   \/_/ \/_/   \/_____/
echo.
echo               Continuous Delivery Pipeline
echo ========================================================
echo.

echo [1/6] Checking Environment...
call :RESOLVE_BUN
if errorlevel 1 goto :END

where gh >nul 2>nul
if errorlevel 1 goto :GH_MISSING

gh auth status >nul 2>nul
if errorlevel 1 goto :GH_AUTH_MISSING

where git >nul 2>nul
if errorlevel 1 goto :GIT_MISSING

echo [OK] GitHub CLI and Git are ready.
echo.

call :GET_LATEST_VERSION
if not "%LATEST_TAG%"=="" (
    echo Current latest release tag: %LATEST_TAG%
) else (
    echo Current latest release tag: none found yet
)
echo.

:ASK_VER
set "VER_INPUT="
set "CHANNEL_INPUT="
set "ITERATION_INPUT="
set /p VER_INPUT="Enter version in the form 0.0.0 (leave blank to republish latest): "
if "%VER_INPUT%"=="" (
    if not "%LATEST_TAG%"=="" (
        set "TAG=%LATEST_TAG%"
        goto :PROMPT_COMMIT
    )
    echo [WARN] No latest release exists yet, so enter a version manually.
    echo.
    goto :ASK_VER
)
if /i "%VER_INPUT:~0,1%"=="v" set "VER_INPUT=%VER_INPUT:~1%"

powershell -NoProfile -Command "$v='%VER_INPUT%'; if ($v -match '^([0-9]+)\.([0-9]+)\.([0-9]+)$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [WARN] Invalid version format. Use 0.0.0.
    echo.
    goto :ASK_VER
)

echo.
set /p CHANNEL_INPUT="Release channel: alpha [a], beta [b], or leave blank for production: "
for /f "tokens=* delims= " %%A in ("%CHANNEL_INPUT%") do set "CHANNEL_INPUT=%%A"
set "CHANNEL_INPUT=%CHANNEL_INPUT:~0,1%"
if /i "%CHANNEL_INPUT%"=="a" goto :ASK_ALPHA_ITERATION
if /i "%CHANNEL_INPUT%"=="b" goto :ASK_BETA_ITERATION
if "%CHANNEL_INPUT%"=="" (
    set "TAG=v%VER_INPUT%"
    goto :PROMPT_COMMIT
)
echo [WARN] Invalid channel. Use a, b, or leave it blank for production.
echo.
goto :ASK_VER

:ASK_ALPHA_ITERATION
set /p ITERATION_INPUT="Enter alpha iteration number: "
if "%ITERATION_INPUT%"=="" (
    echo [WARN] Alpha releases require an iteration number.
    echo.
    goto :ASK_ALPHA_ITERATION
)
powershell -NoProfile -Command "$n='%ITERATION_INPUT%'; if ($n -match '^[0-9]+$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [WARN] Iteration number must be digits only.
    echo.
    goto :ASK_ALPHA_ITERATION
)
set "TAG=v%VER_INPUT%-alpha.%ITERATION_INPUT%"
goto :PROMPT_COMMIT

:ASK_BETA_ITERATION
set /p ITERATION_INPUT="Enter beta iteration number: "
if "%ITERATION_INPUT%"=="" (
    echo [WARN] Beta releases require an iteration number.
    echo.
    goto :ASK_BETA_ITERATION
)
powershell -NoProfile -Command "$n='%ITERATION_INPUT%'; if ($n -match '^[0-9]+$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [WARN] Iteration number must be digits only.
    echo.
    goto :ASK_BETA_ITERATION
)
set "TAG=v%VER_INPUT%-beta.%ITERATION_INPUT%"

:PROMPT_COMMIT
echo.
echo ==========================================
echo    Target Release Tag: %TAG%
echo ==========================================
echo.
set /p COMMIT_MESSAGE="Commit message (leave blank to use the default push timestamp message): "
echo.
set /p CONFIRM="Proceed? (y/N): "
if /i not "%CONFIRM%"=="y" goto :END

call :CREATE_COMMIT
if errorlevel 1 goto :END

echo.
echo [2/6] Running the Bun CI build pipeline...
set "VISHNU_NO_PAUSE=1"
call scripts\ci.bat
set "VISHNU_NO_PAUSE="
if errorlevel 1 goto :CI_FAILED

echo.
echo [3/6] Pushing the current branch for Vercel...
git push origin HEAD
if errorlevel 1 goto :BRANCH_PUSH_FAILED

echo.
echo [4/6] Publishing Tag %TAG%...
git rev-parse %TAG% >nul 2>nul
if not errorlevel 1 goto :TAG_EXISTS
goto :CREATE_TAG

:TAG_EXISTS
echo [WARN] Tag %TAG% already exists locally or remotely.
echo        Deleting the old release and republishing it from the current build.
git tag -d %TAG% >nul 2>nul
git push origin :refs/tags/%TAG% >nul 2>nul
gh release delete %TAG% --yes >nul 2>nul

:CREATE_TAG
git tag %TAG%
if errorlevel 1 goto :TAG_FAILED

git push origin %TAG%
if errorlevel 1 goto :TAG_PUSH_FAILED

echo.
echo [5/6] GitHub Actions will build and publish installers for %TAG%.
echo.
echo [SUCCESS] Tag %TAG% pushed.
echo [6/6] The latest branch push is now available for Vercel's dashboard deployment hooks.
echo Track the workflow at: https://github.com/KffeePt/vishnu/actions/workflows/release.yml
echo Latest stable downloads:
echo   https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.exe
echo   https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.sh
goto :END

:CREATE_COMMIT
set "HUMAN_TIMESTAMP="
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'MMMM d, yyyy h:mm tt'"`) do set "HUMAN_TIMESTAMP=%%T"
if "%HUMAN_TIMESTAMP%"=="" set "HUMAN_TIMESTAMP=%DATE% %TIME%"
if "%COMMIT_MESSAGE%"=="" (
    set "FULL_COMMIT_MESSAGE=[vishnu: %TAG%] push %HUMAN_TIMESTAMP%"
) else (
    set "FULL_COMMIT_MESSAGE=[vishnu: %TAG%] %COMMIT_MESSAGE%"
)
echo.
echo Preparing commit:
echo   %FULL_COMMIT_MESSAGE%
git add -A
if errorlevel 1 goto :COMMIT_STAGE_FAILED
git diff --cached --quiet
if not errorlevel 1 (
    echo No staged changes detected. Skipping commit creation.
    exit /b 0
)
git commit -m "%FULL_COMMIT_MESSAGE%"
if errorlevel 1 goto :COMMIT_FAILED
echo Commit created successfully.
exit /b 0

:GET_LATEST_VERSION
set "LATEST_TAG="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$tag = gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>$null; if ($tag) { $tag }"`) do set "LATEST_TAG=%%V"
exit /b 0

:GH_MISSING
echo [FAIL] GitHub CLI gh not found.
set "EXIT_CODE=1"
goto :END

:GH_AUTH_MISSING
echo [FAIL] GitHub CLI is not authenticated. Run gh auth login first.
set "EXIT_CODE=1"
goto :END

:GIT_MISSING
echo [FAIL] Git was not found in PATH.
set "EXIT_CODE=1"
goto :END

:COMMIT_STAGE_FAILED
echo [FAIL] git add -A failed.
set "EXIT_CODE=1"
exit /b %EXIT_CODE%

:COMMIT_FAILED
echo [FAIL] git commit failed.
set "EXIT_CODE=1"
exit /b %EXIT_CODE%

:CI_FAILED
echo [FAIL] scripts\ci.bat failed.
set "EXIT_CODE=1"
goto :END

:BRANCH_PUSH_FAILED
echo [FAIL] Failed to push the current branch to origin.
set "EXIT_CODE=1"
goto :END

:TAG_FAILED
echo [FAIL] Failed to create local tag.
set "EXIT_CODE=1"
goto :END

:TAG_PUSH_FAILED
echo [FAIL] Failed to push tag to origin.
set "EXIT_CODE=1"
goto :END

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

:END
echo.
if /i "%VISHNU_NO_PAUSE%"=="1" exit /b %EXIT_CODE%
pause
exit /b %EXIT_CODE%
