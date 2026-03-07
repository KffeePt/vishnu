# Installer End-to-End Behavior

The **Vishnu Installer** (`setup.exe` / `vishnu-installer.exe`) is a robust C++ application designed to bootstrap the entire development ecosystem from zero.

## 1. Initialization & Privilege Escalation

- **Entry Point:** `main()` in `codeman/setup/src/main.cpp`.
- **Singleton Check:** Uses `CreateToolhelp32Snapshot` to detect and murder any other running instances of `setup.exe` or `vishnu-installer.exe` to prevent file locking conflicts.
- **Admin Rights:** Checks for Administrator privileges. If missing, it re-launches itself with `runas` verb to request elevation from Windows UAC.

## 2. Environment Pre-Flight

1.  **Node.js Check:** Verifies `node -v`. Aborts if missing.
2.  **SSH Configuration:**
    - Checks if `ssh-agent` is running. Attempts to start it via PowerShell if not.
    - Checks for `~/.ssh/id_rsa`.
    - **Key Generation:** If no key exists, runs `ssh-keygen -t rsa -b 4096`.
    - **Github Auth:** Copies the public key to clipboard and pauses, instructing the user to add it to GitHub Settings. This is a critical manual handshake.
    - **Host Scanning:** Runs `ssh-keyscan github.com` to prevent "Are you sure?" prompts during git operations.

## 3. System Installation / Update

- **Target:** `~/Documents/GitHub/vishnu`.
- **Clone vs Update:**
    - If folder exists: Runs `git pull origin main`.
    - If missing: Runs `git clone ...`.
- **Linkage:**
    - Runs `npm install` inside the directory.
    - Runs `npm unlink -g vishnu-system` (cleanup).
    - Runs `npm link` to expose the global `vishnu` binary.

## 4. Project Context Selection (The TUI)

After installation, the installer enters an interactive TUI (Terminal User Interface):

- **Scanning:** Lists all folders in `~/Documents/GitHub`.
- **Scaffolding:** Offers `+ Create New Project`.
    - Supports **Next.js** (`npx create-next-app`).
    - Supports **Flutter** (`flutter create`).
- **Selection:** User selects a project to "Link".

## 5. Auto-Configuration (`link-project`)

Once a project is selected, the installer launches `vishnu link-project` in that directory. This subcommand:
1.  Scans for Firebase Config (`firebase.json`, `.firebaserc`).
2.  Updates `~/.vishnu/state.json` setting this as the active project.
3.  Injects/Verifies `.env` variables (`OWNER_EMAIL`, `PROJECT_ID`).

## 6. Uninstall Flow

If `vishnu` is already installed, the installer offers an **Uninstall** option:
- Unlinks the global binary.
- Optionally helps invoke `rm -rf` on the source directory.
- Cleans up `~/.vishnu` config.
