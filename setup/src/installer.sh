#!/usr/bin/env bash
set -euo pipefail

# Vishnu System - macOS/Linux Installer
# This script sets up SSH, clones the repo, and links the 'codeman' command.

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
    cd "$PROJECT_DIR"
    
    CURRENT_VERSION="unknown"
    if [ -f "version.json" ]; then
        CURRENT_VERSION=$(grep '"version"' version.json | head -n 1 | sed -E 's/.*"version": ?"([^"]+)".*/\1/')
    fi
    
    log_info "Current version: $CURRENT_VERSION"
    git fetch origin main >/dev/null 2>&1
    
    REMOTE_VERSION=$(git show origin/main:version.json 2>/dev/null | grep '"version"' | head -n 1 | sed -E 's/.*"version": ?"([^"]+)".*/\1/' || echo "unknown")
    
    if [ "$REMOTE_VERSION" != "unknown" ] && [ "$CURRENT_VERSION" != "$REMOTE_VERSION" ]; then
        log_info "✨ Update available! ($CURRENT_VERSION -> $REMOTE_VERSION)"
        read -p "Update now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            log_warn "Skipping update."
        else
            log_info "Updating repository..."
            git pull origin main
        fi
    else
        log_ok "Already up to date."
    fi
else
    log_info "Cloning repository..."
    cd "$GITHUB_DIR"
    git clone git@github.com:KffeePt/vishnu.git
    cd "$PROJECT_DIR"
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

echo ""
log_ok "=== VISHNU SYSTEM SETUP COMPLETE ==="
echo "Run 'codeman' to start."
