# Rapid Implementation Plan (S-AGI)

Date: 2026-02-06
Owner: Core app team
Scope: Speed up feature delivery in Agent Chat + Main Chat + AI routers

---

## 1) Context and Goal

This plan is based on:

- Local S-AGI architecture review.
- Comparison with 1Code patterns for agent/tool UX and state handling.
- Comparison with Midday patterns for monorepo workflow, task pipelines, and technical documentation discipline.

Primary goal: reduce time-to-implement for new agent/chat features by minimizing cross-file coupling and making streaming/tool state predictable.

Success target (first 2 weeks):

- 30-40% fewer files touched per feature.
- Faster implementation cycle for medium features (from multi-day to 1-2 days).
- Fewer regressions in tool state rendering and streaming UI.

---

## 2) Current Bottlenecks (High Impact)

Critical monoliths currently slow down implementation:

- `apps/electron/main/lib/trpc/routers/ai.ts` (~4033 lines)
- `apps/electron/renderer/features/agent/agent-panel.tsx` (~2321 lines)
- `apps/electron/renderer/features/chat/chat-view.tsx` (~2169 lines)

Observed friction patterns:

1. Streaming transport, merge logic, and UI rendering are mixed in large components.
2. Tool status semantics are spread across files and can drift (`pending/done/error/interrupted`).
3. Agent task/timeline UX still depends too much on raw tool events instead of normalized timeline items.
4. Main chat and agent chat duplicate event/state handling patterns.
5. Insufficient protocol docs for stream events and UI state machine.

---

## 3) What to Reuse from 1Code and Midday

### 3.1 1Code (agent UI patterns)

Adopt now:

- Centralized `getToolStatus` semantics with explicit interruption handling.
- Tool-specific rendering components (task/todo/search/bash/edit) instead of one large conditional block.
- Task/todo summary cards derived from changes (started/completed/updated), not just raw tool lines.

Why it helps:

- Lower cognitive load when adding new tools.
- Consistent status behavior across streaming boundaries.

### 3.2 Midday (delivery workflow patterns)

Adopt now:

- Clear task pipeline and ownership by domain.
- Enforced lightweight docs per core subsystem.
- Build/test task organization that makes boundaries explicit.

Why it helps:

- Faster onboarding and less accidental coupling.
- Easier parallel implementation.

---

## 4) Execution Plan

## Phase A (1-3 days): Quick Wins

### A1. Stabilize tool status contract

Create a single shared status helper for agent tools:

- New: `apps/electron/renderer/features/agent/lib/tool-status.ts`
- Use it from:
  - `apps/electron/renderer/features/agent/agent-tool-registry.tsx`
  - `apps/electron/renderer/features/agent/agent-tool-call-flat.tsx`
  - `apps/electron/renderer/features/agent/agent-reasoning.tsx`

Required states:

- `pending`, `success`, `error`, `interrupted`
- Streaming-aware (`streaming` and pre-stream/submitted equivalent)

Acceptance:

- No tool remains visually "running" after stream stops.

### A2. Extract stream reducers (no behavior change)

Split event handling from UI components.

- New hook: `apps/electron/renderer/features/agent/hooks/use-agent-stream.ts`
- New hook: `apps/electron/renderer/features/chat/hooks/use-chat-stream.ts`

Acceptance:

- `agent-panel.tsx` and `chat-view.tsx` shrink and keep same runtime behavior.

### A3. Add explicit protocol docs

Create:

- `docs/agent-stream-protocol.md`
- `docs/chat-stream-protocol.md`

Define event types, ordering guarantees, and fallback behavior.

Acceptance:

- Any developer can add one new stream event without reverse engineering the whole panel.

---

## Phase B (1-2 weeks): Medium Refactors

### B1. Split `agent-panel.tsx` into composable modules

Target structure:

- `apps/electron/renderer/features/agent/agent-panel.tsx` (orchestrator only)
- `apps/electron/renderer/features/agent/components/agent-header.tsx`
- `apps/electron/renderer/features/agent/components/agent-message-list.tsx`
- `apps/electron/renderer/features/agent/components/agent-input-bar.tsx`
- `apps/electron/renderer/features/agent/components/agent-message-item.tsx`

Acceptance:

- Main panel file under ~800 lines.

### B2. Introduce normalized timeline model

New mapper layer:

- `apps/electron/renderer/features/agent/lib/timeline-normalizer.ts`

Transforms raw tool calls into stable timeline entries:

- `task_started`, `task_completed`, `search_done`, `code_executed`, `sheet_read_failed_no_active`

Acceptance:

- Reasoning panel shows semantic progression, not noisy low-level lines.

### B3. Split `ai.ts` router by concern

Current monolith should be split into:

- `apps/electron/main/lib/trpc/routers/ai/stream-core.ts`
- `apps/electron/main/lib/trpc/routers/ai/tools.ts`
- `apps/electron/main/lib/trpc/routers/ai/annotations.ts`
- `apps/electron/main/lib/trpc/routers/ai/code-interpreter.ts`
- `apps/electron/main/lib/trpc/routers/ai/index.ts`

Acceptance:

- Adding one provider/tool path does not require edits across unrelated logic.

---

## Phase C (Hardening): Regression Prevention

### C1. Snapshot tests for tool label/status mapping

Add tests for:

- Tool state transitions.
- Label generation for common error paths (example: no active spreadsheet).

### C2. Stream event fixture tests

Replay fixture event sequences and verify final message/tool state.

### C3. Lightweight architecture checks

Rule: renderer components must not own protocol parsing.

- Parsing belongs in hooks/lib normalizers.

---

## 5) Prioritized Backlog (Implementation Order)

1. A1: Shared tool status helper
2. A2: Extract stream hooks (agent/chat)
3. A3: Protocol docs
4. B1: Agent panel component split
5. B2: Timeline normalizer
6. B3: AI router split
7. C1/C2/C3 hardening

---

## 6) Delivery Model

Recommended PR slicing:

- PR-1: status helper + wiring (small, safe)
- PR-2: stream hooks extraction (no behavior change)
- PR-3: docs protocol
- PR-4: agent panel split
- PR-5: timeline normalizer
- PR-6: ai router split

Each PR should include:

- Before/after touched-file count.
- Manual verification checklist for agent and main chat flows.

---

## 7) Risks and Mitigation

Risk: regressions in streaming UX while extracting hooks.

Mitigation:

- Keep behavior parity in A2.
- Add fixture replay tests before B refactors.

Risk: over-refactor without immediate velocity gain.

Mitigation:

- Enforce phase gates.
- Do not start B3 until A1-A3 are merged.

---

## 8) Definition of Done

This plan is considered successful when:

1. New agent/chat feature can be implemented by touching <= 5 focused files.
2. Tool status behavior is consistent across agent and main chat.
3. Stream protocol is documented and used by hooks, not ad-hoc in UI files.
4. Team can ship iterative agent UX improvements without editing 2k-4k line files directly.
