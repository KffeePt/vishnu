# Vishnu - The Preserver System

> "Now I am become Death, the destroyer of worlds." - *J. Robert Oppenheimer (invoking the Bhagavad Gita)*

**Vishnu** is a global preservation system for development environments. It ensures that your tooling, context, and state remain consistent across chaos.

## 📚 Documentation
- [Architecture Overview](docs/architecture/overview.md)
- [Global Workflow](docs/architecture/global-workflow.md)
- [Installer Behavior](docs/installer/behavior.md)
- [Database & Auth Schema](docs/database/auth-schema.md)

## 🚀 Installation
1.  Clone this repository.
2.  Run `code-manager/setup/setup.exe` (or compile it).
3.  Follow the interactive installer.

## ⚡ Global Command
Once installed, use `vishnu` anywhere:

```bash
vishnu
```
- **Auto-Detects** your project context (Next.js, Flutter, etc.).
- **Validates** your `.env` and authentication.
- **Grants** access to specific generators and tools.

## 🛠️ Components
- **CodeMan**: The Interactive CLI (TypeScript).
- **Shiva**: The background organizer agent.
- **Installer**: The C++ bootstrapper.

---
*Built with ❤️ by xanti*
