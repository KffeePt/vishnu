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
set "LATEST_BASE_VERSION="
set "CHANNEL_INPUT="
set "ITERATION_INPUT="
set "NEXT_ITERATION=1"
set "TAG="
set "COMMIT_MESSAGE="
set "BLANK_VERSION_SELECTED=0"

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

echo [1/7] Checking Environment...
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

set "LATEST_TAG="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$tag = gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>$null; if ($tag) { $tag }"`) do set "LATEST_TAG=%%V"
set "LATEST_BASE_VERSION="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$tag='%LATEST_TAG%'; if ($tag -match '^v(\d+\.\d+\.\d+)(?:-(?:alpha|beta)\.\d+)?$') { Write-Output $matches[1] }"`) do set "LATEST_BASE_VERSION=%%V"
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
set "BLANK_VERSION_SELECTED=0"
set /p VER_INPUT="Enter version in the form 0.0.0 (leave blank to reuse the latest base version): "
if "%VER_INPUT%"=="" (
    if not "%LATEST_BASE_VERSION%"=="" (
        set "VER_INPUT=%LATEST_BASE_VERSION%"
        set "BLANK_VERSION_SELECTED=1"
        echo Using latest base version: %VER_INPUT%
        echo.
        goto :ASK_CHANNEL
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

:ASK_CHANNEL
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
set "NEXT_ITERATION=1"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$version='%VER_INPUT%'; $channel='alpha'; $escaped=[regex]::Escape($version); $pattern='^v' + $escaped + '-' + $channel + '\.(\d+)$'; $tags = gh release list --limit 1000 --json tagName --jq '.[].tagName' 2>$null; $max = 0; foreach ($tag in ($tags -split \"`r?`n\")) { if ($tag -match $pattern) { $candidate = [int]$matches[1]; if ($candidate -gt $max) { $max = $candidate } } }; Write-Output ($max + 1)"`) do set "NEXT_ITERATION=%%V"
set /p ITERATION_INPUT="Enter alpha iteration number [%NEXT_ITERATION%]: "
if "%ITERATION_INPUT%"=="" (
    set "ITERATION_INPUT=%NEXT_ITERATION%"
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
set "NEXT_ITERATION=1"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$version='%VER_INPUT%'; $channel='beta'; $escaped=[regex]::Escape($version); $pattern='^v' + $escaped + '-' + $channel + '\.(\d+)$'; $tags = gh release list --limit 1000 --json tagName --jq '.[].tagName' 2>$null; $max = 0; foreach ($tag in ($tags -split \"`r?`n\")) { if ($tag -match $pattern) { $candidate = [int]$matches[1]; if ($candidate -gt $max) { $max = $candidate } } }; Write-Output ($max + 1)"`) do set "NEXT_ITERATION=%%V"
set /p ITERATION_INPUT="Enter beta iteration number [%NEXT_ITERATION%]: "
if "%ITERATION_INPUT%"=="" (
    set "ITERATION_INPUT=%NEXT_ITERATION%"
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

echo.
echo [2/7] Running the Bun CI build pipeline and staging release assets...
set "VISHNU_NO_PAUSE=1"
set "VISHNU_RELEASE_TAG=%TAG%"
set "VISHNU_RELEASE_VERSION=%TAG:v=%"
set "VISHNU_REQUIRE_SIGNATURES=1"
call scripts\ci.bat
set "VISHNU_NO_PAUSE="
set "VISHNU_RELEASE_TAG="
set "VISHNU_RELEASE_VERSION="
set "VISHNU_REQUIRE_SIGNATURES="
if errorlevel 1 goto :CI_FAILED

echo.
echo [3/7] Creating the release commit...
call :CREATE_COMMIT
if errorlevel 1 goto :END

echo.
echo [4/7] Pushing the current branch for Vercel...
git push origin HEAD
if errorlevel 1 goto :BRANCH_PUSH_FAILED

echo.
echo [5/7] Publishing Tag %TAG%...
git rev-parse %TAG% >nul 2>nul
if not errorlevel 1 goto :TAG_EXISTS
goto :CREATE_TAG

:TAG_EXISTS
if "%BLANK_VERSION_SELECTED%"=="1" if /i not "%TAG%"=="%LATEST_TAG%" goto :TAG_EXISTS_NOT_LATEST
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
echo [6/7] Waiting for the GitHub release to appear...
call :WAIT_FOR_RELEASE "%TAG%"
if errorlevel 1 goto :RELEASE_WAIT_FAILED
echo.
echo [SUCCESS] Release %TAG% is live.
echo [7/7] The latest branch push is now available for Vercel's dashboard deployment hooks.
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

:WAIT_FOR_RELEASE
set "RELEASE_READY="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$tag='%~1'; $deadline=(Get-Date).AddMinutes(10); $required=@('vishnu-installer.exe','vishnu-installer.sh','vishnu-installer.exe.sha256','vishnu-installer.sh.sha256','vishnu-installer.exe.asc','vishnu-installer.sh.asc'); do { try { $raw = gh release view $tag --json tagName,assets 2>$null; if ($LASTEXITCODE -eq 0 -and $raw) { $release = $raw | ConvertFrom-Json; $names = @($release.assets | ForEach-Object { $_.name }); $missing = @($required | Where-Object { $_ -notin $names }); if ($missing.Count -eq 0) { Write-Host ('Release assets detected: ' + $names.Count); Write-Output 'ready'; exit 0 } } } catch { }; Start-Sleep -Seconds 10 } while ((Get-Date) -lt $deadline); exit 1"`) do set "RELEASE_READY=%%V"
if /i "%RELEASE_READY%"=="ready" exit /b 0
exit /b 1

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

:TAG_EXISTS_NOT_LATEST
echo [FAIL] Tag %TAG% already exists, but it is not the latest published release.
echo        Leaving the version blank only republishes the latest exact tag.
echo        Choose a different channel or iteration to create a new release,
echo        or type the exact version manually if you want to republish an older tag.
set "EXIT_CODE=1"
goto :END

:RELEASE_WAIT_FAILED
echo [FAIL] Timed out waiting for GitHub to create the release or upload its assets.
echo        Check the workflow run and release page for %TAG%.
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
