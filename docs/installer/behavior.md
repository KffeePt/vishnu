# Installer End-to-End Behavior

The **Vishnu Installer** (`vishnu-installer.exe` / `vishnu-installer.sh`) bootstraps the system onto the managed stable release channel.

## 1. Initialization & Privilege Escalation

- **Entry Point:** `setup/src/main.cpp` on Windows and `setup/src/installer.sh` on Unix.
- **Singleton Check (Windows):** Prevents multiple installer instances from fighting over the same files.
- **Admin Rights (Windows):** Re-launches with `runas` when elevation is required.

## 2. Environment Pre-Flight

1. **Node.js Check:** Verifies `node` is installed.
2. **SSH Configuration:**
   - Ensures `ssh-agent` is available.
   - Generates `~/.ssh/id_rsa` if missing.
   - Copies the public key to the clipboard and pauses for the GitHub key registration step.
   - Adds the GitHub host key to `known_hosts`.

## 3. Stable Release Installation / Update

- **Target:** `~/Documents/GitHub/vishnu`
- **Channel Source:** Stable GitHub Release tags only (`vX.Y.Z`)
- **Ignored Tags:** `-alpha.N` and `-beta.N` prereleases never drive production installs or the stable updater.
- **Flow:**
  1. Clone the repo if it is missing.
  2. Fetch tags from `origin`.
  3. Resolve the newest stable tag.
  4. Read that tag's `version.json`.
  5. Block the install if `min_installer_version` is newer than the current bootstrapper.
  6. Force the local repo onto the managed `stable` branch at that release tag.
  7. Run `npm install` and `npm link`.
- **Managed Install Marker:** Writes `~/.vishnu/install.json` so the runtime launcher knows which repo is the production-managed install.

## 4. Windows Start Menu Integration

- Creates `%APPDATA%\Microsoft\Windows\Start Menu\Programs\codeman.lnk`
- Launch target: `powershell.exe`
- Launch behavior: open PowerShell in the installed Vishnu repo and run `codeman`
- Icon source: `assets/icon.ico`

## 5. Runtime Update Behavior

- `bin/vishnu.js` invokes `update.js` before launching Codeman.
- `update.js` only mutates the managed install recorded in `~/.vishnu/install.json`.
- The updater fetches release tags, resolves the newest stable tag, verifies installer compatibility, resets the managed repo to that tag on branch `stable`, and runs `npm install`.

## 6. Uninstall Flow

If Vishnu is already installed, the installer offers an **Uninstall** option:
- Unlinks the global package.
- Removes the `codeman` Start Menu entry.
- Deletes the managed install marker.
- Optionally removes the source repo.
- Optionally removes `~/.vishnu`.
