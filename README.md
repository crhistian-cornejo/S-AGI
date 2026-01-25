# S-AGI

<p align="center">
  <img src="apps/electron/renderer/public/logo.svg" width="140" alt="S-AGI Logo" />
</p>

<p align="center">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://electronjs.org"><img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Maintained%3F-yes-green.svg?style=flat-square" alt="Maintained" />
</p>

---

## 🚀 The AI-First Spreadsheet Experience

S-AGI isn't just a spreadsheet viewer; it's a **collaborative intelligence** for your data. While traditional spreadsheets wait for you to type formulas, S-AGI lives inside your data, understanding context and executing complex operations through natural language.

### 🔄 S-AGI vs. Traditional Sheets

| Capability | Traditional Sheets (Excel/Google) | S-AGI |
| :--- | :--- | :--- |
| **Formula Creation** | Manual syntax (IF, VLOOKUP, etc.) | Natural Language (e.g., "Calculate tax based on...") |
| **Data Cleanup** | Manual find-and-replace / RegEx | Smart Agent reasoning & autonomous fixing |
| **PDF Integration** | Static file attachment | **Intelligent parsing & automatic cell population** |
| **Logic** | Static, formula-dependent | **Agent Loop** (Multi-step reasoning & execution) |
| **History** | Basic cell versioning | Full AI-driven conversation context |

### 🧠 What can you actually DO with S-AGI?

#### 1. Natural Language Data Engineering
Forget memorizing complex Excel nested IFs or VLOOKUPs. Just ask:
- *"Calculate the commissions for all sales reps where the margin is over 20% and format the cell in green if it exceeds $5k."*
- *"Extract the domain names from this column of emails and create a unique count in a new sheet."*

#### 2. AI-Powered Notes & Documents (Notion-Style)
S-AGI extends beyond cells. It includes a rich-text document engine designed for structured thinking:
- **AI Co-Writer**: Generate reports, documentation, or summaries directly within the app.
- **Block-Based Editing**: A modern editing experience compatible with Notion-style blocks.
- **Smart Linking**: Connect your spreadsheet data directly into your documents for automated reporting.

#### 3. Deep Chat PDF & Universal Intelligence
The "Doc-to-Sheet" pipeline is just the beginning:
- **Chat with PDF**: Ask questions across your entire document library. S-AGI understands context across multiple formats.
- **Auto-Extraction**: S-AGI parses the document structure, identifies tables, and **populates your worksheet automatically**.
- **Contextual Querying**: *"Look at this invoice and tell me if we are being overcharged based on our April prices in the sheet."*

#### 4. Agentic Problem Solving (The Reasoner)
Unlike basic chatbots, S-AGI uses an **Agent Loop**. If you give it a complex task like *"Find the errors in this financial report and fix them"*, the agent:
1. **Reads** the sheet data.
2. **Identifies** inconsistencies (e.g., sums that don't match).
3. **Drafts** a fix.
4. **Executes** the correction directly in the Univer engine.

#### 4. Formula Mastery & Debugging
S-AGI is a world-class formula expert. It can:
- **Write**: Create complex `ARRAYFORMULA` or custom logic from scratch.
- **Explain**: Tell you exactly why a `#REF!` error is happening.
- **Fix**: Automatically repair broken references across multiple sheets.

---

## 🛠 Features for Power Users

- **Univer Spreadsheet Engine**: A professional-grade, high-performance engine supporting real-time formula execution and rich cell styling.
- **Persistent Knowledge**: Everything is backed by **Supabase**. Your chats, your sheets, and your parsed documents are synced and secure.
- **Claude Code Integration**: Deeply integrated with Claude for high-reasoning tasks, ensuring the highest level of accuracy for complex data analysis.
- **Safety First**: Three permission modes (**Safe, Guided, Auto**) ensure you stay in control of what the agent modifies.

---

## 📦 Installation & Setup

### Prerequisites
- [Bun](https://bun.sh) (Required). **Do not use npm/yarn**.
- A Supabase account for cloud persistence.

### Build from Source
```bash
git clone https://github.com/crhistian-cornejo/S-AGI.git
cd S-AGI
bun install
bun run dev
```

---

## 🏗 Architecture & Internal Flow

```
S-AGI/
├── apps/
│   └── electron/              # Desktop GUI (tRPC + Vite + React 19)
├── packages/
│   └── core/                  # Agent Logic, PDF Processing, Formula Generator
├── public/                    # Global Assets
└── deps/                      # Native Spreadsheet Modules (Univer)
```

## 🍎 Technical Requirements

| Requirement | Value |
|-------------|-------|
| **Runtime** | Bun 1.1+ |
| **Electron**| v33.4.5 |
| **Memory**   | 4GB+ Recommended |
| **Storage**  | Supabase (Cloud) |

---

## 📜 License & Attribution

Distributed under the **Apache-2.0 License**.

### Credits & Inspiration
This project acknowledges [21st-dev/1code](https://github.com/21st-dev/1code) as an initial starting point. While S-AGI drew inspiration from its early UI concepts, the **core engine, agent architecture, and document processing systems have been completely re-engineered** to support high-performance analytical workflows and the Univer engine integration. We give full credit to the 1code team for providing the spark that led to this technical evolution.

"Univer" is a trademark of [Univerjs](https://univer.ai/).

