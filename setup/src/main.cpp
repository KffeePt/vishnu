// ... (Keeping headers and helpers)
#include <iostream>
#include <string>
#include <vector>
#include <filesystem>
#include <fstream>
#include <cstdlib>
#include <regex>
#include <thread>
#include <chrono>
#include <ctime>
#include <conio.h>
#include <windows.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <cctype>
#include <tlhelp32.h>
#include <algorithm>
#include <cstdio>
#include <memory>
#include <array>
#include <sstream>

namespace fs = std::filesystem;
using namespace std;

#ifndef INSTALLER_VERSION_STR
#define INSTALLER_VERSION_STR "0.0.0"
#endif

const string INSTALLER_VERSION = INSTALLER_VERSION_STR;
const string STABLE_BRANCH = "stable";
const string STABLE_DOWNLOAD_URL_WINDOWS = "https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.exe";


// --- Colors ---
const string RESET = "\033[0m";
const string RED = "\033[31m";
const string GREEN = "\033[32m";
const string YELLOW = "\033[33m";
const string BLUE = "\033[34m";
const string MAGENTA = "\033[35m";
const string CYAN = "\033[36m";
const string BOLD = "\033[1m";

// --- Helpers ---
void log(const string& msg, const string& color = RESET) {
    cout << color << msg << RESET << endl;
}

void printHeader() {
    cout << CYAN;
    // Using raw string literal carefully to avoid backslash+newline issues
    cout << R"(
 __    __   __     ______     __  __     __   __     __  __    
/\ \  / /  /\ \   /\  ___\   /\ \_\ \   /\ "-.\ \   /\ \/\ \
\ \ \' /   \ \ \  \ \___  \  \ \  __ \  \ \ \-.  \  \ \ \_\ \
 \ \__/     \ \_\  \/\_____\  \ \_\ \_\  \ \_\\"\_\  \ \_____\
  \/_/       \/_/   \/_____/   \/_/\/_/   \/_/ \/_/   \/_____/
)" << endl;
    cout << RESET << endl;
    log("               System Integrator v" + INSTALLER_VERSION + " (C++)", CYAN);
    cout << endl;
}

bool runCommand(const string& cmd) {
    int ret = system(cmd.c_str());
    return ret == 0;
}

string ask(const string& prompt, const string& defaultVal = "") {
    cout << CYAN << "? " << RESET << prompt;
    if (!defaultVal.empty()) {
        cout << " (" << defaultVal << ")";
    }
    cout << ": ";
    string input;
    getline(cin, input);
    if (input.empty()) return defaultVal;
    return input;
}

void pauseExit(int code = 1) {
    cout << RED << "Process terminated. Press any key to close." << RESET << endl;
    _getch();
    exit(code);
}

// --- Admin Privileges ---
bool isAdministrator() {
    BOOL fIsRunAsAdmin = FALSE;
    PSID pAdminSID = NULL;
    SID_IDENTIFIER_AUTHORITY NtAuthority = SECURITY_NT_AUTHORITY;
    if (AllocateAndInitializeSid(
        &NtAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
        DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &pAdminSID)) {
        if (!CheckTokenMembership(NULL, pAdminSID, &fIsRunAsAdmin)) {
            fIsRunAsAdmin = FALSE;
        }
        FreeSid(pAdminSID);
    }
    return fIsRunAsAdmin;
}

void elevate() {
    char szPath[MAX_PATH];
    if (GetModuleFileNameA(NULL, szPath, ARRAYSIZE(szPath))) {
        SHELLEXECUTEINFOA sei = { sizeof(sei) };
        sei.lpVerb = "runas";
        sei.lpFile = szPath;
        sei.hwnd = NULL;
        sei.nShow = SW_NORMAL;
        if (!ShellExecuteExA(&sei)) {
            DWORD dwError = GetLastError();
            if (dwError == ERROR_CANCELLED) {
                log("[WARN] usage requires admin privileges. Exiting.", RED);
                exit(1);
            }
        } else {
            exit(0); // Quit this instance, the new one is starting
        }
    }
}

void KillOtherInstances() {
    DWORD myPid = GetCurrentProcessId();
    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnap == INVALID_HANDLE_VALUE) return;

    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(pe);

    if (Process32First(hSnap, &pe)) {
        do {
            string procName = pe.szExeFile;
            string target = "setup.exe"; 
            string targetNew = "vishnu-installer.exe"; 
            
            string lowProc = procName;
            transform(lowProc.begin(), lowProc.end(), lowProc.begin(), ::tolower);
            
            if ((lowProc == target || lowProc == targetNew) && pe.th32ProcessID != myPid) {
                 HANDLE hProc = OpenProcess(PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
                 if (hProc) {
                     TerminateProcess(hProc, 0);
                     CloseHandle(hProc);
                 }
            }
        } while (Process32Next(hSnap, &pe));
    }
    CloseHandle(hSnap);
}

bool isSSHAgentRunning() {
    return runCommand("ssh-add -l >nul 2>&1") || runCommand("sc query ssh-agent | findstr RUNNING >nul 2>&1");
}

void startSSHAgent() {
    log("Attempting to start ssh-agent...", YELLOW);
    runCommand("powershell -Command \"Set-Service -Name ssh-agent -StartupType Automatic\"");
    runCommand("powershell -Command \"Start-Service ssh-agent\"");
}

string getCommandOutput(const string& cmd) {
    array<char, 128> buffer;
    string result;
    unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd.c_str(), "r"), _pclose);
    if (!pipe) return "";
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
        result += buffer.data();
    }
    return result;
}

string trim(const string& value) {
    const auto start = value.find_first_not_of(" \r\n\t");
    if (start == string::npos) return "";
    const auto end = value.find_last_not_of(" \r\n\t");
    return value.substr(start, end - start + 1);
}

vector<int> parseVersion(const string& rawVersion) {
    string version = rawVersion;
    if (!version.empty() && (version[0] == 'v' || version[0] == 'V')) {
        version = version.substr(1);
    }

    smatch match;
    if (!regex_match(version, match, regex("^(\\d+)\\.(\\d+)\\.(\\d+)$"))) {
        return {};
    }

    return { stoi(match[1]), stoi(match[2]), stoi(match[3]) };
}

int compareVersions(const string& left, const string& right) {
    const auto leftParts = parseVersion(left);
    const auto rightParts = parseVersion(right);
    if (leftParts.size() != 3 || rightParts.size() != 3) {
        return 0;
    }

    for (size_t index = 0; index < 3; ++index) {
        if (leftParts[index] > rightParts[index]) return 1;
        if (leftParts[index] < rightParts[index]) return -1;
    }

    return 0;
}

bool isStableTag(const string& tag) {
    return regex_match(trim(tag), regex("^v(\\d+)\\.(\\d+)\\.(\\d+)$"));
}

string extractJsonValue(const string& json, const string& key) {
    smatch match;
    regex pattern("\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
    if (regex_search(json, match, pattern)) {
        return match[1];
    }
    return "";
}

string escapeJson(const string& value) {
    string escaped;
    escaped.reserve(value.size());
    for (const char ch : value) {
        switch (ch) {
            case '\\': escaped += "\\\\"; break;
            case '"': escaped += "\\\""; break;
            case '\n': escaped += "\\n"; break;
            case '\r': escaped += "\\r"; break;
            case '\t': escaped += "\\t"; break;
            default: escaped += ch; break;
        }
    }
    return escaped;
}

string escapePowerShellLiteral(const string& value) {
    string escaped;
    escaped.reserve(value.size());
    for (const char ch : value) {
        if (ch == '\'') escaped += "''";
        else escaped += ch;
    }
    return escaped;
}

wstring toWide(const string& value) {
    const int sizeNeeded = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (sizeNeeded <= 0) return L"";
    wstring result(sizeNeeded, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, result.data(), sizeNeeded);
    if (!result.empty() && result.back() == L'\0') {
        result.pop_back();
    }
    return result;
}

void checkNode() {
    log("[Check] Checking Environment...", BLUE);
    if (!runCommand("node -v >nul 2>&1")) {
        log("[FAIL] Node.js not found! Please install Node.js first.", RED);
        exit(1);
    }
    log("[OK] Node.js found.", GREEN);
}

void setupSSH() {
    log("\n[Check] SSH Configuration", BLUE);
    if (!isSSHAgentRunning()) {
        startSSHAgent();
        if (!isSSHAgentRunning()) {
            log("[WARN] Could not start ssh-agent automatically. ensure it is running.", YELLOW);
        } else {
            log("[OK] ssh-agent is running.", GREEN);
        }
    }

    const char* up = getenv("USERPROFILE");
    string home = up ? string(up) : ".";
    fs::path sshDir = fs::path(home) / ".ssh";
    fs::path pubKey = sshDir / "id_rsa.pub";
    fs::path privKey = sshDir / "id_rsa";

    if (!fs::exists(pubKey)) {
        log("[INFO] No SSH key found. Generating new key...", YELLOW);
        if (!fs::exists(sshDir)) fs::create_directories(sshDir);
        string cmd = "ssh-keygen -t rsa -b 4096 -C \"vishnu-setup\" -f \"" + privKey.string() + "\" -N \"\"";
        if (!runCommand(cmd)) {
            log("[FAIL] Failed to generate SSH key. Check permissions.", RED);
            return;
        }
        log("[OK] SSH key generated.", GREEN);
    } else {
        log("[INFO] Existing SSH key found.", GREEN);
    }

    string clipCmd = "type \"" + pubKey.string() + "\" | clip";
    runCommand(clipCmd);
    log("[OK] Public key copied to clipboard.", GREEN);

    cout << endl;
    cout << MAGENTA << ">> STEP REQUIRED: Add Key to GitHub <<" << RESET << endl;
    cout << "1. The key is in your clipboard." << endl;
    cout << "2. Go to: " << BOLD << "https://github.com/settings/keys" << RESET << endl;
    cout << "3. Paste the key (click 'New SSH key')." << endl;
    cout << "4. Come back here and press Enter." << endl;
    cout << endl;
    
    cout << CYAN << "Press Enter to continue..." << RESET;
    while(true) {
        int c = _getch();
        if (c == 13) break; // Enter
    }
    cout << endl;

    string addCmd = "ssh-add \"" + privKey.string() + "\"";
    runCommand(addCmd);

    log("[INFO] Scanning GitHub host key...", YELLOW);
    fs::path knownHosts = sshDir / "known_hosts";
    string scanCmd = "ssh-keyscan -H github.com >> \"" + knownHosts.string() + "\" 2>nul";
    runCommand(scanCmd);
}

string getGitHubPath() {
    const char* userProfile = getenv("USERPROFILE");
    if (!userProfile) return ".";
    fs::path ghPath = fs::path(userProfile) / "Documents" / "GitHub";
    if (!fs::exists(ghPath)) {
        fs::create_directories(ghPath);
    }
    return ghPath.string();
}

fs::path getInstallConfigPath() {
    const char* userProfile = getenv("USERPROFILE");
    string home = userProfile ? string(userProfile) : ".";
    return fs::path(home) / ".vishnu" / "install.json";
}

void writeManagedInstallConfig(const fs::path& vishnuPath, const string& installedVersion, const string& tag) {
    const fs::path configPath = getInstallConfigPath();
    fs::create_directories(configPath.parent_path());
    ofstream out(configPath, ios::trunc);
    out << "{\n";
    out << "  \"channel\": \"stable\",\n";
    out << "  \"installerVersion\": \"" << escapeJson(INSTALLER_VERSION) << "\",\n";
    out << "  \"installedAt\": \"" << escapeJson(to_string(time(nullptr))) << "\",\n";
    out << "  \"installedVersion\": \"" << escapeJson(installedVersion) << "\",\n";
    out << "  \"rootPath\": \"" << escapeJson(vishnuPath.string()) << "\",\n";
    out << "  \"tag\": \"" << escapeJson(tag) << "\"\n";
    out << "}\n";
}

void removeManagedInstallConfig() {
    const fs::path configPath = getInstallConfigPath();
    if (fs::exists(configPath)) {
        fs::remove(configPath);
    }
}

string getLocalVersion(const fs::path& repoPath) {
    const fs::path versionPath = repoPath / "version.json";
    if (!fs::exists(versionPath)) return "unknown";
    const string content = getCommandOutput("type \"" + versionPath.string() + "\"");
    const string version = extractJsonValue(content, "version");
    return version.empty() ? "unknown" : version;
}

string getCurrentBranch(const fs::path& repoPath) {
    return trim(getCommandOutput("git -C \"" + repoPath.string() + "\" branch --show-current 2>nul"));
}

string getLatestStableTag(const fs::path& repoPath) {
    const string output = getCommandOutput("git -C \"" + repoPath.string() + "\" tag -l \"v*\"");
    string latestTag;
    vector<int> latestParts;

    istringstream stream(output);
    string line;
    while (getline(stream, line)) {
        const string tag = trim(line);
        if (!isStableTag(tag)) continue;

        const auto parts = parseVersion(tag);
        if (latestTag.empty() || parts > latestParts) {
            latestTag = tag;
            latestParts = parts;
        }
    }

    return latestTag;
}

string getVersionMetadataAtTag(const fs::path& repoPath, const string& tag) {
    return getCommandOutput("git -C \"" + repoPath.string() + "\" show " + tag + ":version.json 2>nul");
}

bool ensureInstallerVersionCompatible(const fs::path& repoPath, const string& tag, string& targetVersion) {
    const string metadata = getVersionMetadataAtTag(repoPath, tag);
    if (metadata.empty()) {
        log("[FAIL] Could not read version.json from release " + tag + ".", RED);
        return false;
    }

    targetVersion = extractJsonValue(metadata, "version");
    const string minInstallerVersion = extractJsonValue(metadata, "min_installer_version");
    if (!minInstallerVersion.empty() && compareVersions(INSTALLER_VERSION, minInstallerVersion) < 0) {
        log("[FAIL] This installer is too old for release " + tag + ".", RED);
        log("       Installer version: " + INSTALLER_VERSION, RED);
        log("       Required minimum:  " + minInstallerVersion, RED);
        log("       Download the latest stable installer:", YELLOW);
        log("       " + STABLE_DOWNLOAD_URL_WINDOWS, CYAN);
        return false;
    }

    return true;
}

bool syncRepoToStableTag(const fs::path& repoPath, const string& tag) {
    return runCommand("git -C \"" + repoPath.string() + "\" reset --hard") &&
           runCommand("git -C \"" + repoPath.string() + "\" checkout -B " + STABLE_BRANCH + " " + tag) &&
           runCommand("git -C \"" + repoPath.string() + "\" reset --hard " + tag);
}

fs::path getStartMenuShortcutPath() {
    const char* appData = getenv("APPDATA");
    if (!appData) return {};
    return fs::path(appData) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "codeman.lnk";
}

bool createCodemanShortcut(const fs::path& repoPath) {
    const fs::path shortcutPath = getStartMenuShortcutPath();
    if (shortcutPath.empty()) return false;

    const HRESULT initResult = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    const bool shouldUninitialize = SUCCEEDED(initResult);
    if (FAILED(initResult) && initResult != RPC_E_CHANGED_MODE) {
        return false;
    }

    IShellLinkW* shellLink = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_IShellLinkW, reinterpret_cast<void**>(&shellLink));
    if (SUCCEEDED(hr)) {
        const string args = "-NoExit -ExecutionPolicy Bypass -Command \"Set-Location -LiteralPath '" +
            escapePowerShellLiteral(repoPath.string()) + "'; codeman\"";
        const fs::path iconPath = repoPath / "assets" / "icon.ico";

        shellLink->SetPath(L"powershell.exe");
        shellLink->SetArguments(toWide(args).c_str());
        shellLink->SetWorkingDirectory(repoPath.wstring().c_str());
        if (fs::exists(iconPath)) {
            shellLink->SetIconLocation(iconPath.wstring().c_str(), 0);
        }

        IPersistFile* persistFile = nullptr;
        hr = shellLink->QueryInterface(IID_IPersistFile, reinterpret_cast<void**>(&persistFile));
        if (SUCCEEDED(hr)) {
            fs::create_directories(shortcutPath.parent_path());
            hr = persistFile->Save(shortcutPath.wstring().c_str(), TRUE);
            persistFile->Release();
        }

        shellLink->Release();
    }

    if (shouldUninitialize) {
        CoUninitialize();
    }

    return SUCCEEDED(hr);
}

void removeCodemanShortcut() {
    const fs::path shortcutPath = getStartMenuShortcutPath();
    if (!shortcutPath.empty() && fs::exists(shortcutPath)) {
        fs::remove(shortcutPath);
    }
}

// --- Menu Helper ---
int loopMenu(const string& title, const vector<string>& options) {
    int selected = 0;
    while(true) {
        system("cls");
        printHeader();
        cout << BLUE << title << RESET << endl << endl;

        for (int i = 0; i < options.size(); ++i) {
            if (i == selected) cout << GREEN << "> " << BOLD << options[i] << RESET << endl;
            else cout << "  " << options[i] << endl;
        }
        
        cout << endl << CYAN << "(Use Arrow Keys to navigate, Enter to select)" << RESET << endl;

        int c = _getch();
        if (c == 0 || c == 224) {
            c = _getch();
            if (c == 72) { // Up
                selected--;
                if (selected < 0) selected = options.size() - 1;
            } else if (c == 80) { // Down
                selected++;
                if (selected >= options.size()) selected = 0;
            }
        } else if (c == 13) return selected;
    }
}

int main() {
    KillOtherInstances();

    if (!isAdministrator()) {
        elevate();
        return 0;      
    }

    try {
        // --- 1. System Maintenance Scope (Vishnu) ---
        string ghPath = getGitHubPath();
        fs::path vishnuPath = fs::path(ghPath) / "vishnu";
        bool isInstalled = fs::exists(vishnuPath);

        // Pre-flight check
        system("cls");
        printHeader();
        checkNode();
        Sleep(1000); // Brief pause to see node check

        int choiceIndex = 0;
        if (isInstalled) {
            vector<string> mainOpts = {
                "Launch / Update / Repair System",
                "Uninstall Vishnu System",
                "Exit"
            };
            choiceIndex = loopMenu(" Main Menu", mainOpts);
        } else {
            // Force Install if not found
            choiceIndex = 0; 
        }

        if (isInstalled && choiceIndex == 1) {
            // UNINSTALL
            bool removedGlobal = false;
            bool removedDir = false;
            bool removedConfig = false;

            system("cls");
            printHeader();
            log("\n[Uninstall] Removing Vishnu System...", YELLOW);
            
            // Unlink
            log("   - Unlinking global command...", CYAN);
            if(runCommand("npm unlink -g vishnu-system >nul 2>&1")) removedGlobal = true;
            removeCodemanShortcut();
            removeManagedInstallConfig();

            // Remove Directory
            string confirm = ask("Remove 'vishnu' source directory? (y/N)", "N");
            if (confirm == "y" || confirm == "Y") {
                 log("   - Removing directory...", RED);
                 fs::remove_all(vishnuPath);
                 removedDir = true;
            }

            // Remove Config
            const char* up = getenv("USERPROFILE");
            string home = up ? string(up) : ".";
            fs::path configDir = fs::path(home) / ".vishnu";
            if (fs::exists(configDir)) {
                 if (ask("Remove global config (~/.vishnu)? (y/N)", "N") == "y") {
                      log("   - Removing global config...", RED);
                      fs::remove_all(configDir);
                      removedConfig = true;
                 }
            }
            
            // Final Uninstall Report
            system("cls");
            printHeader();
            cout << RED << "=== VISHNU SYSTEM UNINSTALLED ===" << RESET << endl << endl;
            cout << "1. Global Link:     " << (removedGlobal ? (RED + "Removed") : (YELLOW + "Not Found/Skipped")) << RESET << endl;
            cout << "2. Source Files:    " << (removedDir ? (RED + "Deleted") : (YELLOW + "Kept")) << RESET << endl;
            cout << "3. Config Data:     " << (removedConfig ? (RED + "Deleted") : (YELLOW + "Kept")) << RESET << endl;
            cout << endl;
            cout << YELLOW << "Press any key to exit..." << RESET << endl;
            _getch();
            return 0;
        } else if (isInstalled && choiceIndex == 2) {
            return 0; // Exit
        }

        // --- INSTALL / UPDATE FLOW (Selection 0) ---
        
        // Setup SSH
        setupSSH(); 

        log("\n[Installer] Setting up Vishnu System...", BLUE);
        
        // Ensure we are in GitHub folder for this part
        fs::current_path(ghPath);

        bool sourceReady = false;
        string targetTag;
        string targetVersion;

        if (fs::exists("vishnu")) {
             log("[INFO] 'vishnu' directory found.", GREEN);
             sourceReady = true;
        } else {
             // Clone
             log("Cloning Vishnu System into " + fs::current_path().string() + "...", CYAN);
             if (runCommand("git clone git@github.com:KffeePt/vishnu.git vishnu")) {
                 sourceReady = true;
             }
        }
        
        if (!sourceReady) {
             log("[FAIL] Failed to setup source directory!", RED);
             pauseExit();
        }

        log("Fetching stable release tags...", CYAN);
        if (!runCommand("git -C \"" + vishnuPath.string() + "\" fetch origin --tags --force")) {
            log("[FAIL] Failed to fetch release tags from origin.", RED);
            pauseExit();
        }

        const string currentVersion = getLocalVersion(vishnuPath);
        const string currentBranch = getCurrentBranch(vishnuPath);
        targetTag = getLatestStableTag(vishnuPath);
        if (targetTag.empty()) {
            log("[FAIL] No stable release tags were found on origin.", RED);
            pauseExit();
        }

        if (!ensureInstallerVersionCompatible(vishnuPath, targetTag, targetVersion)) {
            pauseExit();
        }

        log("Current version: " + currentVersion, CYAN);
        log("Target stable release: " + targetTag + " (" + targetVersion + ")", CYAN);

        if (currentVersion != targetVersion || currentBranch != STABLE_BRANCH) {
            log("Aligning install to managed stable branch...", CYAN);
            if (!syncRepoToStableTag(vishnuPath, targetTag)) {
                log("[FAIL] Failed to sync repo to stable release " + targetTag + ".", RED);
                pauseExit();
            }
        } else {
            log("[OK] Already aligned to the latest stable release.", GREEN);
        }

        // NPM Install & Link
        log("Checking dependencies...", CYAN);
        
        string installCmd = "cd \"" + vishnuPath.string() + "\" && npm install";
        if(!runCommand(installCmd)) {
             log("[FAIL] npm install failed.", RED);
             pauseExit();
        }

        log("\n[Link] Exposing global command...", BLUE);
        runCommand("npm unlink -g vishnu-system >nul 2>&1");
        
        string linkCmd = "cd \"" + vishnuPath.string() + "\" && npm link";
        if(!runCommand(linkCmd)) {
            log("[FAIL] npm link failed.", RED);
            pauseExit();
        }
        
        log("[OK] CodeMan linked globally.", GREEN);
        const bool shortcutCreated = createCodemanShortcut(vishnuPath);
        if (shortcutCreated) {
            log("[OK] Start Menu shortcut created: codeman", GREEN);
        } else {
            log("[WARN] Could not create the Start Menu shortcut.", YELLOW);
        }
        writeManagedInstallConfig(vishnuPath, targetVersion, targetTag);

        // --- 3. Final Report & Pause ---
        system("cls");
        printHeader();
        cout << GREEN << "=== VISHNU SYSTEM SETUP COMPLETE ===" << RESET << endl << endl;
        cout << "1. SSH Setup:       " << GREEN << "OK" << RESET << endl;
        cout << "2. System Install:  " << GREEN << "OK" << RESET << endl;
        cout << "3. Global Link:     " << GREEN << "OK" << RESET << endl;
        cout << "4. Release Channel: " << GREEN << targetTag << RESET << endl;
        cout << "5. Start Menu Link: " << (shortcutCreated ? GREEN + string("OK") : YELLOW + string("WARN")) << RESET << endl;
        cout << endl;
        cout << "You can now run 'codeman' from any terminal." << endl;
        cout << "You can also launch 'codeman' from the Windows Start Menu." << endl;
        cout << "The first time you run it in a new project, it will guide you through setup." << endl;
        cout << endl;
        
        cout << YELLOW << "Press any key to exit installer..." << RESET << endl;
        _getch();

        return 0;      
    } catch (const std::exception& e) {
        log("[CRITICAL] Error: " + string(e.what()), RED);
        std::cin.ignore();
        return 1;
    } catch (...) {
        log("[CRITICAL] Unknown error.", RED);
        std::cin.ignore();
        return 1;
    }
}
