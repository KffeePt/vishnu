@echo off
pushd "%~dp0"
taskkill /F /IM vishnu-installer.exe >nul 2>&1
if not exist "output" mkdir output
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content ..\version.json | ConvertFrom-Json).version"`) do set VISHNU_VERSION=%%V
if "%VISHNU_VERSION%"=="" (
    echo [FAIL] Could not read version.json
    popd
    exit /b 1
)
echo [INFO] Building Vishnu Installer (Windows)...
g++ -std=c++17 -DINSTALLER_VERSION_STR=\"%VISHNU_VERSION%\" -o output/vishnu-installer.exe src/main.cpp -static -ladvapi32 -lshlwapi -luser32 -lole32 -luuid
if %errorlevel% neq 0 (
    echo [FAIL] C++ Build failed!
    popd
    exit /b %errorlevel%
)

echo [INFO] Packaging Vishnu Installer (macOS/Linux)...
powershell -NoProfile -Command "$content = Get-Content src\installer.sh -Raw; $content = $content -replace '__INSTALLER_VERSION__', '%VISHNU_VERSION%'; Set-Content output\vishnu-installer.sh $content -NoNewline"
if %errorlevel% neq 0 (
    echo [FAIL] Failed to package installer script!
    popd
    exit /b %errorlevel%
)

echo [INFO] Writing SHA-256 manifests...
powershell -NoProfile -Command "$sha = [System.Security.Cryptography.SHA256]::Create(); $stream = [System.IO.File]::OpenRead('output\vishnu-installer.exe'); try { $hash = ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join ''; [System.IO.File]::WriteAllText('output\vishnu-installer.exe.sha256', $hash + ' *vishnu-installer.exe') } finally { $stream.Dispose(); $sha.Dispose() }"
if %errorlevel% neq 0 (
    echo [FAIL] Failed to write vishnu-installer.exe.sha256
    popd
    exit /b %errorlevel%
)
powershell -NoProfile -Command "$sha = [System.Security.Cryptography.SHA256]::Create(); $stream = [System.IO.File]::OpenRead('output\vishnu-installer.sh'); try { $hash = ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join ''; [System.IO.File]::WriteAllText('output\vishnu-installer.sh.sha256', $hash + ' *vishnu-installer.sh') } finally { $stream.Dispose(); $sha.Dispose() }"
if %errorlevel% neq 0 (
    echo [FAIL] Failed to write vishnu-installer.sh.sha256
    popd
    exit /b %errorlevel%
)

echo [SUCCESS] Build complete.
echo    - output/vishnu-installer.exe
echo    - output/vishnu-installer.sh
echo    - output/vishnu-installer.exe.sha256
echo    - output/vishnu-installer.sh.sha256

popd
