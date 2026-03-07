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
set /p VER_INPUT="Enter Version (e.g. 1.0.0): "
if "%VER_INPUT%"=="" goto ASK_VER

echo.
echo Select Release Type:
echo   [1] Alpha
echo   [2] Beta
echo   [3] Stable (No suffix)
set /p TYPE_OPT="Select Option (1-3): "

if "%TYPE_OPT%"=="1" (
    set SUFFIX=_alpha
) else if "%TYPE_OPT%"=="2" (
    set SUFFIX=_beta
) else (
    set SUFFIX=
)

:: Construct Tag
set TAG=v%VER_INPUT%%SUFFIX%
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

:: --- 4. Create Release ---
echo.
echo [4/5] Creating GitHub Release %TAG%...
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

:: Create Release (No git tag push handled by us manually effectively, gh release create does it)
call gh release create %TAG% --title "Vishnu System %TAG%" --generate-notes
if %errorlevel% neq 0 (
    echo [FAIL] Failed to create release.
    pause
    exit /b %errorlevel%
)

:: --- 5. Upload Artifacts ---
echo.
echo [5/5] Uploading Artifacts...
call gh release upload %TAG% setup/output/vishnu-installer.exe --clobber
if %errorlevel% neq 0 echo [WARN] Failed to upload .exe
call gh release upload %TAG% setup/output/vishnu-installer.sh --clobber
if %errorlevel% neq 0 echo [WARN] Failed to upload .sh

echo.
echo [SUCCESS] Release %TAG% published!
echo View at: https://github.com/KffeePt/vishnu/releases/tag/%TAG%
pause
