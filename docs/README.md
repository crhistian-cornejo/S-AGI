# 📚 DOCS - Document Structure

**Last Updated**: January 24, 2026

---

## 📁 Directory Structure

```
docs/
├── 📋 README.md                              # Main index
├── 📊 REPORTE_ANALISIS_CODIGO.md            # Code analysis - 70 problems
│
├── 🔄 REFACTOR/                             # Refactoring & performance plans
│   ├── README.md                             # Index of 31 plans
│   ├── PENDING/                              # Not yet implemented
│   │   ├── PRIORITY-1/                         # 6 critical plans
│   │   ├── PRIORITY-2/                         # 13 high priority plans (incl. 1 performance)
│   │   ├── PRIORITY-3/                         # 8 medium priority plans
│   │   └── PRIORITY-4/                         # 4 low priority plans
│   └── IMPLEMENTED/                          # Completed work
│       ├── README.md                             # Index of completed
│       ├── 101-chatgpt-oauth.md                  # ✅ ChatGPT OAuth
│       ├── 102-gemini-oauth.md                   # ✅ Gemini OAuth
│       └── 103-zai-oauth.md                     # 🟡 Z.AI OAuth (partial)
│
└── 📖 Referencia                              # Technical references
    ├── AGENTS.md                               # Development guidelines
    ├── MIDDAY_BEST_PRACTICES.md               # Architecture patterns
    └── tray-best-practices.md                  # Electron tray guidelines
    └── PDF_VIEWER_SOLUTION.md                 # PDF architecture comparison
```

---

## 📋 Document Categories

### 📊 Analysis Reports

**REPORTE_ANALISIS_CODIGO.md** - Complete analysis of 70 structural/architectural problems

**Content**:
- 70 problems categorized by severity
- Specific file locations and line numbers
- Actionable recommendations
- Impact on scalability analysis

**When to read**: Starting refactoring, understanding current state

---

### 🔄 Refactoring Plans (REFACTOR/)

**Purpose**: Plans to fix the 70 code problems identified in analysis report.

**Content**:
- **31 total plans** organized by priority (1-4)
- **1 performance plan** (caching, virtualization, workers)
- Critical: Monoliths splitting, structure violations, duplications
- High: Component splits, service layer, architecture improvements
- Medium: Domain layer, quality improvements
- Low: Technical cleanup

**Location**: `docs/REFACTOR/`

**Status**:
- PENDING: 31/31 (0%)

---

### 🔐 OAuth Integration Plans (REFACTOR/IMPLEMENTED/)

**Purpose**: Completed and partial implementations of AI provider integrations.

**Content**:
- ChatGPT Plus/Pro OAuth (Codex flow) - ✅ Completed
- Gemini OAuth (Google One AI) - ✅ Completed
- Z.AI OAuth (GLM-4.7) - 🟡 Partial (types only)

**Location**: `docs/REFACTOR/IMPLEMENTED/`

**Status**:
- Completed: 2/3
- Partial: 1/3

---

### 📖 Reference Documents

These documents are **technical references** and should NOT be moved to PENDING or IMPLEMENTED.

#### Architecture References
- **AGENTS.md**: Development guidelines for S-AGI
- **MIDDAY_BEST_PRACTICES.md**: Architecture patterns from Midday
- **tray-best-practices.md**: Electron tray best practices

#### Technical Guides
- **PDF_VIEWER_SOLUTION.md**: Comparison of Midday's PDF architecture

---

## 🎯 Quick Reference

### Want to start refactoring?

1. Read `REPORTE_ANALISIS_CODIGO.md` for context
2. Check `REFACTOR/README.md` for all 31 plans
3. Start with `PRIORITY-1` plans (critical)
4. Move completed plans to `IMPLEMENTED/`

### Looking for a specific problem?

| Problem Type | Document |
|--------------|-----------|
| Large monolithic files | `REFACTOR/PENDING/PRIORITY-1/001-split-tools-router.md` |
| Duplicated code | `REFACTOR/PENDING/PRIORITY-1/004-eliminate-store-duplications.md` |
| Hooks in wrong location | `REFACTOR/PENDING/PRIORITY-1/003-move-hooks-to-hooks-dir.md` |
| Business logic in routers | `REFACTOR/PENDING/PRIORITY-2/013-extract-services.md` |
| Performance issues | `REFACTOR/PENDING/PRIORITY-2/031-caching-virtualization-workers.md` |
| OAuth integrations | `REFACTOR/IMPLEMENTED/` (check each provider) |

### Need architecture guidelines?

- **Development patterns**: `AGENTS.md`
- **Best practices**: `MIDDAY_BEST_PRACTICES.md`
- **Tray implementation**: `tray-best-practices.md`

---

## 📊 Status Overview

```
┌─────────────────────────────────────────────┐
│ REFACTORING & PERFORMANCE            │
├──────────────────────────────────────────┤
│ PRIORITY 1: 0/6 completed (0%)       │
│ PRIORITY 2: 0/13 completed (0%)      │
│ PRIORITY 3: 0/8 completed (0%)       │
│ PRIORITY 4: 0/4 completed (0%)       │
├──────────────────────────────────────────┤
│ TOTAL: 0/31 completed (0%)            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ OAUTH INTEGRATIONS                  │
├──────────────────────────────────────────┤
│ ChatGPT: ✅ Completed                │
│ Gemini:  ✅ Completed                │
│ Z.AI:     🟡 Partial (types only)   │
└─────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### New Developer

1. Read `AGENTS.md` for architecture overview
2. Read `REPORTE_ANALISIS_CODIGO.md` for current issues
3. Check `REFACTOR/README.md` for improvement roadmap
4. Start with a PRIORITY 1 refactoring task

### Experienced Developer

1. Review `REFACTOR/PENDING/PRIORITY-1/` for critical issues
2. Choose a task based on expertise
3. Implement according to plan
4. Move to `IMPLEMENTED/` when done

### Need to add a new plan?

1. Create plan in appropriate `PRIORITY-X/` directory
2. Follow existing plan template
3. Update `REFACTOR/README.md` with new entry
4. Assign priority based on impact

---

## 📝 Document Standards

All refactoring plans should include:

- 📋 Overview of the problem
- 🎯 Objectives and success criteria
- 🔧 Detailed implementation plan
- ✅ Acceptance criteria checklist
- 🧪 Testing strategy
- ⚠️ Risks and mitigation
- 📊 Metrics (before/after)
- 🔄 Rollback plan
- 📚 Related documents

See existing plans for templates.

---

## 🔍 Search & Navigation

### Find a plan by topic

```bash
# Search for "tools"
grep -r "tools" docs/REFACTOR --include="*.md"

# Search for specific file
grep -r "agent-panel" docs/REFACTOR --include="*.md"
```

### Find by priority

- **Critical**: `REFACTOR/PENDING/PRIORITY-1/`
- **High**: `REFACTOR/PENDING/PRIORITY-2/`
- **Medium**: `REFACTOR/PENDING/PRIORITY-3/`
- **Low**: `REFACTOR/PENDING/PRIORITY-4/`

---

## 📞 Support

- **Questions about architecture**: Ask in team chat
- **Issues with a plan**: Create GitHub issue
- **Need clarification on guidelines**: Check `AGENTS.md`
- **Want to add new plan**: Follow "Need to add a new plan?" section above

---

**Maintainer**: TBD  
**Last Updated**: January 24, 2026  
**Document Version**: v2.1
