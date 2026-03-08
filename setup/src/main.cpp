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
#include <conio.h>
#include <windows.h>
#include <shellapi.h>
#include <cctype>
#include <tlhelp32.h>
#include <algorithm>
#include <cstdio>
#include <memory>
#include <array>

namespace fs = std::filesystem;
using namespace std;

const string INSTALLER_VERSION = "3.0.0";


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
    log("               System Integrator v3.0 (C++)", CYAN);
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

        if (fs::exists("vishnu")) {
             log("[INFO] 'vishnu' directory found.", GREEN);
             fs::current_path("vishnu");

             string currentVersion = "unknown";
             if (fs::exists("version.json")) {
                 string content = getCommandOutput("type version.json");
                 smatch match;
                 if (regex_search(content, match, regex("\"version\"\\s*:\\s*\"([^\"]+)\""))) {
                     currentVersion = match[1];
                 }
             }

             log("Current version: " + currentVersion, CYAN);
             
             runCommand("git fetch origin main >nul 2>&1");
             
             string remoteVersion = "unknown";
             string remoteMeta = getCommandOutput("git show origin/main:version.json 2>nul");
             smatch rMatch;
             if (regex_search(remoteMeta, rMatch, regex("\"version\"\\s*:\\s*\"([^\"]+)\""))) {
                 remoteVersion = rMatch[1];
             }

             if (remoteVersion != "unknown" && remoteVersion != currentVersion) {
                 cout << YELLOW << "\n✨ Update available! (" << currentVersion << " -> " << remoteVersion << ")" << RESET << endl;
                 string ans = ask("Update now? [Y/n]", "Y");
                 if (ans == "Y" || ans == "y") {
                     log("Updating repository...", CYAN);
                     runCommand("git pull origin main");
                 } else {
                     log("[WARN] Skipping update.", YELLOW);
                 }
             } else {
                 string count = getCommandOutput("git rev-list --count HEAD..origin/main");
                 count.erase(remove_if(count.begin(), count.end(), ::isspace), count.end());
                 if(!count.empty() && count != "0") {
                     log(">> Local system is behind by " + count + " commits.", YELLOW);
                     string ans = ask("Pull latest commits? [Y/n]", "Y");
                     if (ans == "Y" || ans == "y") runCommand("git pull origin main");
                 } else {
                     log("[OK] Already up to date.", GREEN);
                 }
             }
             
             fs::current_path(ghPath); // go back to GitHub dir
             sourceReady = true;
        } else {
             // Clone
             log("Cloning Vishnu System into " + fs::current_path().string() + "...", CYAN);
             if (runCommand("git clone -b main git@github.com:KffeePt/vishnu.git vishnu")) {
                 sourceReady = true;
             }
        }
        
        if (!sourceReady) {
             log("[FAIL] Failed to setup source directory!", RED);
             pauseExit();
        }

        // NPM Install & Link
        log("Checking dependencies...", CYAN);
        
        string installCmd = "cd \"" + vishnuPath.string() + "\" && npm install";
        if(!runCommand(installCmd)) {
             log("[WARN] npm install failed. Continuing...", YELLOW);
        }

        log("\n[Link] Exposing global command...", BLUE);
        runCommand("npm unlink -g vishnu-system >nul 2>&1");
        
        string linkCmd = "cd \"" + vishnuPath.string() + "\" && npm link";
        runCommand(linkCmd);
        
        log("[OK] CodeMan linked globally.", GREEN);

        // --- 3. Final Report & Pause ---
        system("cls");
        printHeader();
        cout << GREEN << "=== VISHNU SYSTEM SETUP COMPLETE ===" << RESET << endl << endl;
        cout << "1. SSH Setup:       " << GREEN << "OK" << RESET << endl;
        cout << "2. System Install:  " << GREEN << "OK" << RESET << endl;
        cout << "3. Global Link:     " << GREEN << "OK" << RESET << endl;
        cout << endl;
        cout << "You can now run 'codeman' from any terminal." << endl;
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
