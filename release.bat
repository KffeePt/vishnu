@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: --- Branding ---
cls
echo  __    __   __     ______     __  __     __   __     __  __    
echo /\ \  / /  /\ \   /\  ___\   /\ \_\ \   /\ "-.\ \   /\ \/\ \  
echo \ \ \' /   \ \ \  \ \___  \  \ \  __ \  \ \ \-.  \  \ \ \_\ \ 
echo  \ \__/     \ \_\  \/\_____\  \ \_\ \_\  \ \_\\"\_\  \ \_____\ 
echo   \/_/       \/_/   \/_____/   \/_/\/_/   \/_/ \/_/   \/_____/ 
echo.
echo               Release Pipeline v2.0
echo ========================================================
echo.

:: --- 1. Pre-flight Checks ---
echo [1/5] Checking Environment...
echo Debug: Checking for gh...
where gh >nul 2>nul
if errorlevel 1 (
    echo [FAIL] GitHub CLI (gh) not found.
    pause
    exit /b 1
)
echo Debug: Checking auth...
gh auth status >nul 2>nul
echo Debug: Errorlevel is %errorlevel%
if errorlevel 1 (
    echo [FAIL] GitHub CLI not authenticated. Run 'gh auth login'.
    pause
    exit /b 1
)
echo [OK] GitHub CLI Ready.
echo.

:: --- 2. Input Version & Type ---
:ASK_VER
set /p VER_INPUT="Enter Version (e.g. 1.0.0) or leave blank for latest: "

if "%VER_INPUT%"=="" (
    call :GET_LATEST_VERSION
    if "%LATEST_VERSION%"=="" (
        echo [WARN] No existing stable releases found. Defaulting to 1.0.0
        set VER_INPUT=1.0.0
    ) else (
        set VER_INPUT=%LATEST_VERSION%
        echo Using latest stable version: %VER_INPUT%
    )
)

if /i "%VER_INPUT:~0,1%"=="v" set VER_INPUT=%VER_INPUT:~1%

powershell -NoProfile -Command "$v='%VER_INPUT%'; if ($v -match '^(\\d+)\\.(\\d+)\\.(\\d+)$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [WARN] Invalid version format. Use X.Y.Z (e.g. 1.0.0)
    goto ASK_VER
)

echo.
echo Select Release Type:
echo   [1] Alpha
echo   [2] Beta
echo   [3] Stable (No suffix)
:ASK_TYPE
set /p TYPE_OPT="Select Option (1-3): "

if "%TYPE_OPT%"=="1" (
    set PRE_TYPE=alpha
) else if "%TYPE_OPT%"=="2" (
    set PRE_TYPE=beta
) else if "%TYPE_OPT%"=="3" (
    set PRE_TYPE=
) else (
    echo Invalid selection. Choose 1, 2, or 3.
    goto ASK_TYPE
)

if not "%PRE_TYPE%"=="" (
    :ASK_PRE_NUM
    set /p PRE_NUM="Enter %PRE_TYPE% version number (e.g. 1): "
    if "%PRE_NUM%"=="" goto ASK_PRE_NUM
    for /f "delims=0123456789" %%A in ("%PRE_NUM%") do (
        if not "%%A"=="" (
            echo Invalid number. Use digits only.
            goto ASK_PRE_NUM
        )
    )
    set TAG=v%VER_INPUT%-%PRE_TYPE%.%PRE_NUM%
) else (
    set TAG=v%VER_INPUT%
)
echo.
echo ==========================================
echo    Target Release Tag: %TAG%
echo ==========================================
echo.
set /p CONFIRM="Proceed? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Aborted.
    exit /b 0
)

:: --- 3. Build Artifacts ---
echo.
echo [3/5] Building Artifacts...
call setup\rebuild.bat
if %errorlevel% neq 0 (
    echo [FAIL] Build failed.
    pause
    exit /b %errorlevel%
)

:: --- 4. Create / Push Tag ---
echo.
echo [4/5] Publishing Tag %TAG%...
:: Check if tag exists
git rev-parse %TAG% >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Tag %TAG% already exists locally.
    set /p DEL_TAG="Delete and overwrite? (y/N): "
    if /i "!DEL_TAG!"=="y" (
        git tag -d %TAG% >nul 2>nul
        git push origin :refs/tags/%TAG% >nul 2>nul
        gh release delete %TAG% --yes >nul 2>nul
    ) else (
        echo Aborted.
        exit /b 1
    )
)

git tag %TAG%
if %errorlevel% neq 0 (
    echo [FAIL] Failed to create local tag.
    pause
    exit /b %errorlevel%
)

git push origin %TAG%
if %errorlevel% neq 0 (
    echo [FAIL] Failed to push tag to origin.
    pause
    exit /b %errorlevel%
)

:: --- 5. Trigger Release Workflow ---
echo.
echo [5/5] GitHub Actions will build and publish installers for %TAG%.
if /i "%PRE_TYPE%"=="" (
    echo        Stable tags become the latest release channel.
) else (
    echo        Pre-release tags stay out of the latest stable channel.
)

echo.
echo [SUCCESS] Tag %TAG% pushed!
echo Track the workflow at: https://github.com/KffeePt/vishnu/actions/workflows/release.yml
echo Latest stable downloads:
echo   https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.exe
echo   https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.sh
pause

:: --- Helpers ---
:GET_LATEST_VERSION
set LATEST_VERSION=
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$tags = gh release list --limit 200 --json tagName --jq '.[].tagName' 2>$null; if (-not $tags) { exit 0 }; $versions = $tags | ForEach-Object { if ($_ -match '^v(\\d+)\\.(\\d+)\\.(\\d+)$') { '{0}.{1}.{2}' -f $Matches[1], $Matches[2], $Matches[3] } }; if ($versions) { $versions | Sort-Object { [version]$_ } -Descending | Select-Object -First 1 }"` ) do set LATEST_VERSION=%%V
exit /b
