<p align="center">
  <img src="build/logo.svg" width="128" alt="S-AGI Logo" />
</p>

# S-AGI - AI Spreadsheet Agent

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/electron-33.4.5-informational.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Bun" />
</p>


AI-powered chat assistant for creating spreadsheets, tables, and formulas using Univer.

> **Attribution**: This project is based on [21st-dev/1code](https://github.com/21st-dev/1code) (Apache-2.0 License). See [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES) for full license details.

## Features

- 🤖 **AI Chat** - Natural language interface for spreadsheet creation
- 📊 **Univer Spreadsheets** - Full-featured spreadsheet with formulas
- 🔄 **Artifacts** - Persistent spreadsheet artifacts in chat history
- 🌓 **Themes** - Light/Dark/System mode support
- 💾 **Supabase Backend** - Cloud persistence for all data
- 🖥️ **Cross-platform** - Windows, macOS, and Web support

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron + Vite
- **State**: Jotai, Zustand, React Query
- **Backend**: tRPC, Supabase
- **AI**: AI SDK v6 (Claude Code / OpenAI fallback)
- **Spreadsheets**: Univer
- **Icons**: Tabler Icons

## Getting Started

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your Supabase and API keys

# Development
bun run dev

# Build
bun run build

# Package for distribution
bun run package:win   # Windows
bun run package:mac   # macOS
bun run package:linux # Linux

# Production builds with code signing (macOS)
# 1. Set up Apple Developer account and create App ID
# 2. Generate App-Specific Password in Apple ID settings
# 3. Add to .env:
#    APPLE_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
#    APPLE_TEAM_ID=your_team_id
#    APPLE_ID=your_apple_id
#    APPLE_ID_PASSWORD=your_app_specific_password
# 4. Build: bun run dist
```

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── lib/
│   │   ├── auth/   # Claude Code OAuth
│   │   ├── supabase/
│   │   └── trpc/   # tRPC routers
│   └── index.ts
├── preload/        # IPC bridge
├── renderer/       # React UI
│   ├── components/ui/
│   ├── features/
│   │   ├── chat/
│   │   ├── artifacts/
│   │   ├── sidebar/
│   │   ├── layout/
│   │   └── univer/
│   └── lib/
└── shared/         # Shared types
```

## License

Apache-2.0

See [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES) for third-party license attributions.
