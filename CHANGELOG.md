# Changelog

All notable changes to S-AGI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-02-03

### Added
- **Unified Sidebar Pattern**: All pages (Excel, Doc, PDF, Notes) now follow the same dual-sidebar architecture
- **Agent Panel for Notes**: Added AI assistant panel to the Notes/Ideas tab with writing-focused prompts
- **Notes sidebar icons**: Added NotesIcon component for consistent iconography
- **macOS Traffic Light Support**: Proper handling of window controls when sidebars are collapsed

### Changed
- **PDF Sidebar**: Refactored to match FilesSidebar pattern with icon + label header
- **Notes Sidebar**: Refactored to match FilesSidebar pattern, removed legacy Logo/PageNav components
- **Title Bar**: Unified controls across all tabs with consistent dual-sidebar toggle buttons
- **Main Layout**: Restructured all tab layouts to support main sidebar + page-specific sidebar + Agent Panel

### Fixed
- Fixed sidebar toggle buttons not working when collapsed
- Fixed UI collision between sidebars and macOS traffic light buttons
- Fixed missing imports causing runtime errors in PDF view
- Fixed TypeScript compilation errors in sidebar components

## [0.2.0] - 2026-02-02

### Added
- Initial public release
- Multi-tab workspace: Chat, Spreadsheets, Documents, PDFs, Notes
- AI-powered agent panel with streaming responses
- File versioning system with checkpoint history
- PDF viewer with annotation support
- Spreadsheet editing with Univer integration
- Document editing capabilities
- Notes system with Notion-like hierarchical pages
- Auto-update functionality
- macOS and Windows installers with custom backgrounds

### Infrastructure
- Electron 33 with Vite bundling
- tRPC for type-safe IPC communication
- Jotai for state management
- GitHub Actions CI/CD pipeline
