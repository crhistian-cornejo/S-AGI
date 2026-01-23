<p align="center">
  <img src="public/logo.svg" width="120" alt="S-AGI Logo" />
</p>

# S-AGI
### Spreadsheet Agent with Univer & AI SDK v6

S-AGI is an AI agent designed to interact with spreadsheets naturally. It's not just a chat; it's an interface that understands the context of your data, generates complex formulas, and manipulates cells using the **Univer** engine.

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg?style=flat-square" alt="Bun" />
  <img src="https://img.shields.io/badge/electron-33.4.5-informational.svg?style=flat-square" alt="Electron" />
</p>

---

## 🚀 Key Features
- **Native Spreadsheet Engine**: Unlike other agents that only generate static CSVs, S-AGI uses **Univer** to render real spreadsheets with full formula support and persistent formatting.
- **AI Agent Loop**: Powered by the latest AI SDK patterns for multi-step task execution and dynamic tool usage.
- **Deep Desktop Integration**: Built with Electron for high performance, featuring Supabase persistence, secure session management, and deep linking support (`s-agi://`).
- **Real-time Collaboration**: Chat with Claude to generate, edit, and manipulate sheets in real-time.

## 🛠 Tech Stack
- **Runtime**: [Bun](https://bun.sh) (Mandatory for development and scripts).
- **Frontend**: React 19, TypeScript, Tailwind CSS.
- **State Management**: Jotai (UI), Zustand (Complex state), React Query (Server state).
- **Communication**: tRPC integrated with Electron IPC for type-safe communication between Main and Renderer processes.
- **Backend & Auth**: Supabase (PostgreSQL, Auth, Storage).
- **AI Engine**: OpenAI SDK & Anthropic integration.
- **Spreadsheets**: [@univerjs](https://univer.ai/) presets.

## 📦 Quick Start

### Prerequisites
- **Bun** must be installed on your system.
- Node.js/npm is **not** recommended; use Bun for everything.

### Installation
```bash
# Clone and install dependencies
bun install

# Environment setup
# The predev script will automatically handle .env creation from .env.example
bun run dev
```

### Available Commands
```bash
bun run dev              # Start Electron with hot reload
bun run dev:web          # Start web-only version (no Electron)
bun run build            # Compile application
bun run package:mac      # Generate macOS binary (DMG + ZIP)
bun run package:win      # Generate Windows binary (NSIS + portable)
bun run ts:check         # Run TypeScript type checks
```

## 🍎 macOS Signing & Notarization
To distribute on macOS with Gatekeeper enabled, configure these variables in your `.env`:

- `APPLE_IDENTITY`: Your "Developer ID Application" certificate name.
- `APPLE_TEAM_ID`: Your Apple Developer Team ID.
- `APPLE_ID`: Your Apple Developer email.
- `APPLE_ID_PASSWORD`: Your app-specific password.

## 📜 Attribution & License
This project is a technical evolution based on [21st-dev/1code](https://github.com/21st-dev/1code).  
Distributed under the **Apache-2.0 License**. See [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES) for third-party attribution details.
