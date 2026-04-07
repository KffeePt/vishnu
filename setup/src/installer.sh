#!/usr/bin/env bash
set -euo pipefail

# Vishnu System - macOS/Linux Installer
# This script sets up SSH, clones the repo, aligns it to the latest stable
# release tag, and links the 'codeman' command.

INSTALLER_VERSION="__INSTALLER_VERSION__"
STABLE_BRANCH="stable"
STABLE_DOWNLOAD_URL="https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.sh"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

print_header() {
    clear
    echo -e "${CYAN}"
    echo " __    __   __     ______     __  __     __   __     __  __    "
    echo "/\ \  / /  /\ \   /\  ___\   /\ \_\ \   /\ \"-.\ \   /\ \/\ \  "
    echo "\ \ \' /   \ \ \  \ \___  \  \ \  __ \  \ \ \-.  \  \ \ \_\ \ "
    echo " \ \__/     \ \_\  \/\_____\  \ \_\ \_\  \ \_\\\"\_\  \ \_____\ "
    echo "  \/_/       \/_/   \/_____/   \/_/\/_/   \/_/ \/_/   \/_____/ "
    echo -e "${NC}"
    echo -e "${CYAN}               System Integrator (bash)${NC}"
    echo ""
}

# --- INSTALL LOGIC ---
print_header
log_info "Starting Vishnu System Installation..."
log_info "Installer version: ${INSTALLER_VERSION}"

extract_json_value() {
    local json="$1"
    local key="$2"
    printf '%s' "$json" | grep "\"${key}\"" | head -n 1 | sed -E 's/.*"'"${key}"'": ?"([^"]+)".*/\1/' || true
}

latest_stable_tag() {
    git -C "$1" tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true
}

version_lt() {
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" = "$1" ]
}

write_install_marker() {
    local project_dir="$1"
    local installed_version="$2"
    local tag="$3"
    mkdir -p "$HOME/.vishnu"
    cat > "$HOME/.vishnu/install.json" <<EOF
{
  "channel": "stable",
  "installerVersion": "${INSTALLER_VERSION}",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "installedVersion": "${installed_version}",
  "rootPath": "${project_dir}",
  "tag": "${tag}"
}
EOF
}

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    log_fail "Node.js is not installed. Please install Node.js first."
fi
log_ok "Node.js found: $(node -v)"

# 2. SSH Setup
log_info "Checking SSH Configuration..."
SSH_DIR="$HOME/.ssh"
PUB_KEY="$SSH_DIR/id_rsa.pub"
PRIV_KEY="$SSH_DIR/id_rsa"

if [ ! -f "$PUB_KEY" ]; then
    log_warn "No SSH key found. Generating..."
    mkdir -p "$SSH_DIR"
    ssh-keygen -t rsa -b 4096 -C "vishnu-setup" -f "$PRIV_KEY" -N ""
    log_ok "SSH key generated."
else
    log_ok "Existing SSH key found."
fi

# Copy to clipboard (macOS vs Linux)
if command -v pbcopy &> /dev/null; then
    cat "$PUB_KEY" | pbcopy
    log_ok "Public key copied to clipboard."
elif command -v xclip &> /dev/null; then
    cat "$PUB_KEY" | xclip -selection clipboard
    log_ok "Public key copied to clipboard."
else
    log_warn "Could not auto-copy key. Please copy this manually:"
    cat "$PUB_KEY"
fi

echo ""
echo -e "${YELLOW}>> STEP REQUIRED: Add Key to GitHub <<${NC}"
echo "1. The key is in your clipboard."
echo "2. Go to: https://github.com/settings/keys"
echo "3. Paste the key (click 'New SSH key')."
echo "4. Come back here and press Enter."
read -p "Press Enter to continue..."

# Add to connection
ssh-add "$PRIV_KEY" 2>/dev/null || true
ssh-keyscan -H github.com >> "$SSH_DIR/known_hosts" 2>/dev/null || true

# 3. Clone / Update
GITHUB_DIR="$HOME/Documents/GitHub"
PROJECT_DIR="$GITHUB_DIR/vishnu"
mkdir -p "$GITHUB_DIR"

if [ -d "$PROJECT_DIR" ]; then
    log_info "Evaluating repository updates..."
else
    log_info "Cloning repository..."
    cd "$GITHUB_DIR"
    git clone git@github.com:KffeePt/vishnu.git vishnu
fi

cd "$PROJECT_DIR"

CURRENT_VERSION="unknown"
if [ -f "version.json" ]; then
    CURRENT_VERSION=$(extract_json_value "$(cat version.json)" "version")
fi

git fetch origin --tags --force >/dev/null 2>&1
TARGET_TAG=$(latest_stable_tag "$PROJECT_DIR")
if [ -z "$TARGET_TAG" ]; then
    log_fail "No stable release tags were found on origin."
fi

TARGET_METADATA=$(git show "${TARGET_TAG}:version.json" 2>/dev/null || true)
TARGET_VERSION=$(extract_json_value "$TARGET_METADATA" "version")
MIN_INSTALLER_VERSION=$(extract_json_value "$TARGET_METADATA" "min_installer_version")

if [ -z "$TARGET_VERSION" ]; then
    log_fail "Could not read version metadata for ${TARGET_TAG}."
fi

if [ -n "$MIN_INSTALLER_VERSION" ] && version_lt "$INSTALLER_VERSION" "$MIN_INSTALLER_VERSION"; then
    log_fail "Installer ${INSTALLER_VERSION} is too old for ${TARGET_TAG}. Download the latest stable installer from ${STABLE_DOWNLOAD_URL}"
fi

CURRENT_BRANCH=$(git branch --show-current || true)
log_info "Current version: $CURRENT_VERSION"
log_info "Target stable release: ${TARGET_TAG} (${TARGET_VERSION})"

if [ "$CURRENT_VERSION" != "$TARGET_VERSION" ] || [ "$CURRENT_BRANCH" != "$STABLE_BRANCH" ]; then
    log_info "Aligning repository to the managed stable release..."
    git reset --hard >/dev/null 2>&1
    git checkout -B "$STABLE_BRANCH" "$TARGET_TAG"
    git reset --hard "$TARGET_TAG" >/dev/null 2>&1
else
    log_ok "Already aligned to the latest stable release."
fi

# 4. Install & Link
log_info "Installing dependencies..."
npm install

log_info "Linking global command..."
# Try without sudo first for nvm users, then sudo if needed
if npm link; then
    log_ok "CodeMan linked globally."
else
    log_warn "npm link failed, trying with sudo..."
    sudo npm link
fi

write_install_marker "$PROJECT_DIR" "$TARGET_VERSION" "$TARGET_TAG"

echo ""
log_ok "=== VISHNU SYSTEM SETUP COMPLETE ==="
echo "Stable channel: ${TARGET_TAG}"
echo "Run 'codeman' to start."
