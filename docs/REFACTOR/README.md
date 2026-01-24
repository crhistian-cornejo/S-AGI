# 📋 REFACTORING & IMPLEMENTATION PLANS - INDEX

**Last Updated**: January 24, 2026  
**Total Plans**: 31 (30 refactoring + 1 performance)

---

## 📊 Summary by Category

### 🔴 Refactoring Plans (Priority 1-4)

| Priority | Plans | Status | Est. Hours |
|----------|--------|--------|------------|
| 🔴 PRIORITY 1 (Critical) | 6 | 🟡 PENDING | 40-50 hrs |
| 🟠 PRIORITY 2 (High) | 13 | 🟡 PENDING | 22-28 hrs |
| 🟡 PRIORITY 3 (Medium) | 8 | 🟡 PENDING | 35-40 hrs |
| 🟢 PRIORITY 4 (Low) | 4 | 🟡 PENDING | 5-8 hrs |
| **REFACTORING TOTAL** | **31** | **PENDING** | **102-126 hrs** |

### 🔐 Performance Plans

| Priority | Plans | Status | Est. Hours |
|----------|--------|--------|------------|
| 🟠 PRIORITY 2 (High) | 1 | 🟡 PENDING | 8-12 hrs |
| **PERFORMANCE TOTAL** | **1** | **PENDING** | **8-12 hrs** |

### 🔐 OAuth Integration Plans (Completed/Pending)

| Provider | Status | Location |
|----------|--------|----------|
| ChatGPT Plus/Pro | ✅ IMPLEMENTED | IMPLEMENTED/101-chatgpt-oauth.md |
| Gemini (Google One AI) | ✅ IMPLEMENTED | IMPLEMENTED/102-gemini-oauth.md |
| Z.AI (GLM-4.7) | 🟡 PARTIAL | IMPLEMENTED/103-zai-oauth.md |

---

## 🔴 PRIORITY 1 - CRITICAL (Immediate - This Week)

### Router & AI Service Refactors

1. **[Split tools.ts Router](PRIORITY-1/001-split-tools-router.md)** 🔴
   - Split 5,017-line monolith into 9 modules
   - Est: 6-8 hours
   - Impact: Eliminates 90% merge conflicts in tools

2. **[Split ai.ts Router](PRIORITY-1/002-split-ai-router.md)** 🔴
   - Split 3,620-line monolith into streaming/agents/reasoning/tools
   - Est: 5-7 hours
   - Impact: Improves testability, reduces complexity

### Structure Refactors

3. **[Move Hooks from lib/ to hooks/](PRIORITY-1/003-move-hooks-to-hooks-dir.md)** 🔴
   - Move 7 hooks from lib/ to hooks/
   - Split use-spell-check.ts (1,002 lines)
   - Est: 3-4 hours
   - Impact: Fixes structure violations

### Duplication Elimination

4. **[Eliminate Store Duplications](PRIORITY-1/004-eliminate-store-duplications.md)** 🔴
   - Create generic message queue store
   - Migrate chat and pdf features
   - Est: 2-3 hours
   - Impact: Removes 204 lines of duplicate code

5. **[Centralize File Configurations](PRIORITY-1/005-centralize-file-configs.md)** 🔴
   - Consolidate file size limits and compression configs
   - Create zod schemas for validation
   - Est: 2-3 hours
   - Impact: Single source of truth for file handling

6. **[Centralize Attachment Schema](PRIORITY-1/006-centralize-attachment-schema.md)** 🔴
   - Remove duplicate attachmentSchema definitions
   - Create shared schema with helpers
   - Est: 1-2 hours
   - Impact: Prevents schema inconsistencies

---

## 🟠 PRIORITY 2 - HIGH (Short Term - Next Month)

### Component Refactors

7. **[Split agent-panel.tsx](PRIORITY-2/007-split-agent-panel.md)** 🟠
   - Split 1,104-line component into 8 sub-components
   - Extract hooks: use-agent-streaming, use-agent-input
   - Est: 4-5 hours

8. **[Split pdf-viewer-enhanced.tsx](PRIORITY-2/008-split-pdf-viewer.md)** 🟠
   - Split 2,533-line component into 12 sub-components
   - Extract hooks and state managers
   - Est: 6-8 hours

9. **[Split chat-view.tsx](PRIORITY-2/009-split-chat-view.md)** 🟠
   - Split 1,875-line component into 10 sub-components
   - Extract hooks: use-chat-streaming, use-chat-input
   - Est: 4-5 hours

10. **[Split message-list.tsx](PRIORITY-2/010-split-message-list.md)** 🟠
    - Split 1,441-line component into 8 sub-components
    - Est: 3-4 hours

11. **[Split sidebar.tsx](PRIORITY-2/011-split-sidebar.md)** 🟠
    - Split 1,191-line component into 6 sub-components
    - Extract FadeScrollArea component
    - Est: 3-4 hours

12. **[Split chat-markdown-renderer.tsx](PRIORITY-2/012-split-markdown-renderer.md)** 🟠
    - Split 610-line component into sub-renderers
    - Extract: latex, code, link, table renderers
    - Est: 2-3 hours

13. **[Split agent-tool-calls-group.tsx](PRIORITY-2/017-split-agent-tool-calls.md)** 🟠
    - Split 737-line component into sub-components
    - Extract tree logic to hook
    - Est: 2-3 hours

14. **[Split builtin-themes.ts](PRIORITY-2/018-split-themes.md)** 🟠
    - Split 646-line file into 10 theme files
    - Est: 1-2 hours

### Service Layer Extraction

15. **[Extract Business Logic from Routers](PRIORITY-2/013-extract-services.md)** 🟠
    - Create services/ directory
    - Extract: cleanupChatFiles, enrichWithMeta, parseOAuthTokens
    - Est: 2-3 hours

### Architecture Improvements

16. **[Create Path Aliases](PRIORITY-2/014-path-aliases.md)** 🟠
    - Configure @main/*, @renderer/*, @shared/*
    - Create barrel exports
    - Est: 2-3 hours

17. **[Fix Naming Conventions](PRIORITY-2/015-fix-naming.md)** 🟠
    - Rename: premium-buttom.tsx → premium-button.tsx
    - Rename: trpc.tsx → trpc-client.tsx
    - Est: 1-2 hours

18. **[Move HTML Files to public/](PRIORITY-2/016-move-html-files.md)** 🟠
    - Move quick-prompt.html, tray-popover.html to public/
    - Update load paths
    - Est: 30 min

### Performance Improvements

19. **[Implement Caching, Virtualization & Workers](PRIORITY-2/031-caching-virtualization-workers.md)** 🟠
    - Implement React Query caching
    - Add virtualization for large lists
    - Move heavy tasks to workers
    - Est: 8-12 hours
    - Impact: Improved UX, reduced lag

---

## 🟡 PRIORITY 3 - MEDIUM (Medium Term - Next 3 Months)

### Domain Layer Organization

20. **[Create Domain Layer](PRIORITY-3/019-create-domain-layer.md)** 🟡
    - Create src/main/lib/domain/
    - Move types: ToolContext, AgentContext, PDFCitation
    - Est: 2-3 hours

21. **[Split document-processor.ts](PRIORITY-3/020-split-doc-processor.md)** 🟡
    - Split 541-line file into 5 modules
    - Extract: pdf-processing, text-processing, citations
    - Est: 2-3 hours

### Component Improvements

22. **[Split PdfViewer.tsx](PRIORITY-3/021-split-pdf-viewer-component.md)** 🟡
    - Split 356-line component into 3 components
    - Est: 1-2 hours

23. **[Split univer-theme.ts](PRIORITY-3/022-split-univer-theme.md)** 🟡
    - Extract color utilities to lib/color-utils.ts
    - Est: 1 hour

24. **[Split agent-tool-registry.tsx](PRIORITY-3/023-split-tool-registry.md)** 🟡
    - Separate UI components from registry data
    - Move icons to components/icons/
    - Est: 2 hours

25. **[Move Icons to components/icons/](PRIORITY-3/024-move-icons.md)** 🟡
    - Move agent/icons.tsx to components/icons/
    - Extract CSS from inline styles
    - Est: 1 hour

### Code Quality

26. **[Execute Pending Migrations](PRIORITY-3/025-execute-migrations.md)** 🟡
    - Run database migrations
    - Remove fallback code
    - Est: 1 hour

27. **[Remove TODO Comments](PRIORITY-3/026-remove-todos.md)** 🟡
    - Convert TODOs to issues
    - Remove inline TODOs
    - Est: 2 hours

---

## 🟢 PRIORITY 4 - LOW (Technical Cleanup)

### Minor Improvements

28. **[Extract FadeScrollArea Component](PRIORITY-4/027-extract-fade-scroll.md)** 🟢
    - Extract from sidebar.tsx
    - Move to components/ui/
    - Est: 30 min

29. **[Fix Window Globals](PRIORITY-4/028-fix-globals.md)** 🟢
    - Move globals to WindowManager class
    - Est: 1 hour

30. **[Merge Duplicate Routing Logic](PRIORITY-4/029-merge-routing.md)** 🟢
    - Unify routeMessage and selectAgent
    - Est: 1 hour

31. **[Remove Optimization Premature](PRIORITY-4/030-remove-optimizations.md)** 🟢
    - Remove WeakMap caching in agent-tool-calls-group
    - Est: 30 min

---

## 📈 Progress Tracking

### Overall Refactoring Progress

```
🟡 PENDING: 31/31 (0%)
🟢 COMPLETED: 0/31 (0%)
```

### Priority Progress

```
🔴 PRIORITY 1: 0/6 completed
🟠 PRIORITY 2: 0/13 completed
🟡 PRIORITY 3: 0/8 completed
🟢 PRIORITY 4: 0/4 completed
```

---

## 📅 Suggested Timeline

### Week 1-2 (40-50 hours)
- ✅ PRIORITY 1: All 6 tasks
- Focus: Critical monoliths and duplications

### Month 2 (22-28 hours)
- ✅ PRIORITY 2: All 13 tasks
- Focus: Component splits, service layer, architecture, and performance
- Include: Caching, virtualization, workers

### Months 3-4 (35-40 hours)
- ✅ PRIORITY 3: All 8 tasks
- Focus: Domain layer and quality improvements

### Month 5 (5-8 hours)
- ✅ PRIORITY 4: All 4 tasks
- Focus: Technical cleanup

---

## 🎯 Success Metrics

### Before Refactoring
- Files > 1000 lines: 16
- Duplicated code blocks: 15+
- Structure violations: 25+
- Merge conflicts: 90% probability
- Test coverage: <5%
- Performance: No caching/virtualization

### After Refactoring
- Files > 1000 lines: 0
- Duplicated code blocks: 0
- Structure violations: 0
- Merge conflicts: <10% probability
- Test coverage: ~60%
- Performance: Cached data, virtualized lists, background workers

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../REPORTE_ANALISIS_CODIGO.md) - Full analysis of 70 problems
- [AGENTS.md](../AGENTS.md) - Architecture guidelines
- [MIDDAY_BEST_PRACTICES.md](../MIDDAY_BEST_PRACTICES.md) - Best practices reference

### Reference Documents (Not Plans)

The following are **technical reference documents** and should NOT be considered as refactoring plans:

- **PDF_VIEWER_SOLUTION.md**: Technical comparison of Midday's PDF architecture
- **tray-best-practices.md**: Best practices for Electron tray

---

## 🔍 How to Use This Index

1. **Review PRIORITY 1** plans first - these are critical for scalability
2. **Check IMPLEMENTED/** folder for completed refactors and OAuth integrations
3. **Update status** as you complete tasks
4. **Move completed plans** from PENDING/ to IMPLEMENTED/
5. **Update progress metrics** in this file

---

## 📝 Notes

- **Total Estimated Time**: 102-126 hours for refactoring + performance
- **OAuth Plans**: Already implemented (ChatGPT, Gemini) or partial (Z.AI)
- **ROI**: 3-4 hours saved per hour invested
- **Risk**: Low - Incremental refactoring approach
- **Team**: 1-2 developers recommended

---

**Maintainer**: TBD  
**Last Review**: January 24, 2026  
**Next Review**: After completing PRIORITY 1
