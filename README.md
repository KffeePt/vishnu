# Vishnu - The Preserver System

> "Now I am become Death, the destroyer of worlds." - *J. Robert Oppenheimer (invoking the Bhagavad Gita)*

**Vishnu** is a global preservation system for development environments. It ensures that your tooling, context, and state remain consistent across chaos.

## 📚 Documentation
- [Architecture Overview](docs/architecture/overview.md)
- [Global Workflow](docs/architecture/global-workflow.md)
- [Installer Behavior](docs/installer/behavior.md)
- [Database & Auth Schema](docs/database/auth-schema.md)

## 🚀 Installation & Production Setup
1.  Download the latest stable installer:
    `https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.exe`
    or
    `https://github.com/KffeePt/vishnu/releases/latest/download/vishnu-installer.sh`
2.  Run the installer for your platform.
3.  The installer clones `vishnu`, fetches release tags, and aligns the local install to the latest stable GitHub Release on the managed `stable` branch.
4.  Follow the interactive prompts to bootstrap your environment, authorize your GitHub SSH keys, and link your Firebase backend.
5.  On Windows, the installer also creates a Start Menu entry named `codeman` that opens the Codeman app in PowerShell.

## ⚡ Global Command
Once installed, use `codeman` anywhere:

```bash
codeman
```
- **Stable Release Updates:** The launcher checks the managed stable install and updates it to the latest stable GitHub Release before starting.
- **Auto-Detects** your project context (Next.js, Flutter, etc.).
- **Validates** your `.env`, Firebase backend resources, and authentication state.
- **Grants** role-based access to specific generators and tools based on secure Firebase Auth tokens.

## 🛠️ Components
- **CodeMan**: The Interactive CLI (TypeScript).
- **Shiva**: The background organizer agent.
- **Installer**: The C++ bootstrapper.

---
*Built with ❤️ by xanti*
