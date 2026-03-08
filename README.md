# Vishnu - The Preserver System

> "Now I am become Death, the destroyer of worlds." - *J. Robert Oppenheimer (invoking the Bhagavad Gita)*

**Vishnu** is a global preservation system for development environments. It ensures that your tooling, context, and state remain consistent across chaos.

## 📚 Documentation
- [Architecture Overview](docs/architecture/overview.md)
- [Global Workflow](docs/architecture/global-workflow.md)
- [Installer Behavior](docs/installer/behavior.md)
- [Database & Auth Schema](docs/database/auth-schema.md)

## 🚀 Installation & Production Setup
1.  Clone this repository to your machine.
2.  Run the installer executable: `code-manager/setup/setup.exe` (or run `installer.sh` on Unix).
3.  The installer will automatically check for updates against the global `version.json` and pull the latest production release before proceeding.
4.  Follow the interactive prompts to bootstrap your environment, authorize your GitHub SSH keys, and link your Firebase backend.

## ⚡ Global Command
Once installed, use `vishnu` anywhere:

```bash
vishnu
```
- **Auto-Updates:** Runs `update.js` on launch to verify you are on the latest verified production build.
- **Auto-Detects** your project context (Next.js, Flutter, etc.).
- **Validates** your `.env`, Firebase backend resources, and authentication state.
- **Grants** role-based access to specific generators and tools based on secure Firebase Auth tokens.

## 🛠️ Components
- **CodeMan**: The Interactive CLI (TypeScript).
- **Shiva**: The background organizer agent.
- **Installer**: The C++ bootstrapper.

---
*Built with ❤️ by xanti*
