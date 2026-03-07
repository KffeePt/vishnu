@echo off
pushd "%~dp0"
taskkill /F /IM vishnu-installer.exe >nul 2>&1
if not exist "output" mkdir output
echo [INFO] Building Vishnu Installer (Windows)...
g++ -std=c++17 -o output/vishnu-installer.exe src/main.cpp -static -ladvapi32 -lshlwapi -luser32
if %errorlevel% neq 0 (
    echo [FAIL] C++ Build failed!
    popd
    exit /b %errorlevel%
)

echo [INFO] Packaging Vishnu Installer (macOS/Linux)...
copy src\installer.sh output\vishnu-installer.sh >nul
if %errorlevel% neq 0 (
    echo [FAIL] Failed to copy installer script!
    popd
    exit /b %errorlevel%
)

echo [SUCCESS] Build complete.
echo    - output/vishnu-installer.exe
echo    - output/vishnu-installer.sh

popd
