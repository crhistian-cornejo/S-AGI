# 🔴 PRIORITY 1: Split ai.ts Router

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 5-7 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Current File**: `src/main/lib/trpc/routers/ai.ts`  
**Current Lines**: **3,620**  
**Problem**: Monolithic router mixing streaming, agents, reasoning, and tool execution logic, making it nearly impossible to test and maintain.

---

## 🎯 Objectives

1. Extract AI service architecture into separate modules
2. Separate concerns: streaming, agents, reasoning, tools
3. Improve testability of individual components
4. Maintain backward compatibility

---

## 📁 Proposed Structure

```
src/main/lib/ai/
  ├── ai-service.ts              # Main coordinator, ~150 lines
  ├── streaming/
  │   ├── stream-processor.ts    # ~400 lines
  │   ├── chunk-processor.ts     # ~300 lines
  │   └── response-formatter.ts  # ~200 lines
  ├── agents/
  │   ├── agent-orchestrator.ts # ~300 lines
  │   ├── agent-executor.ts     # ~400 lines
  │   └── agent-context-builder.ts # ~200 lines
  ├── reasoning/
  │   ├── reasoning-engine.ts    # ~350 lines
  │   ├── chain-of-thought.ts    # ~250 lines
  │   └── prompt-templates.ts   # ~150 lines
  └── tools/
      ├── tool-executor.ts       # ~300 lines
      └── tool-result-parser.ts  # ~200 lines
```

---

## 🔧 Implementation Plan

### Step 1: Create new directory structure (5 min)

```bash
mkdir -p src/main/lib/ai/{streaming,agents,reasoning,tools}
```

### Step 2: Analyze existing ai.ts (30 min)

- Map all functions to categories
- Identify dependencies between modules
- Document data flow
- Identify shared utilities

### Step 3: Extract streaming module (1.5 hours)

**stream-processor.ts**:
- Handle SSE streams
- Parse stream chunks
- Emit events to renderer

**chunk-processor.ts**:
- Parse individual chunks
- Buffer incomplete chunks
- Format content

**response-formatter.ts**:
- Format AI responses
- Apply Markdown
- Handle citations

### Step 4: Extract agents module (1.5 hours)

**agent-orchestrator.ts**:
- Route messages to agents
- Manage agent lifecycle
- Handle agent handoffs

**agent-executor.ts**:
- Execute agent logic
- Manage agent state
- Handle agent errors

**agent-context-builder.ts**:
- Build context for agents
- Include previous messages
- Include relevant artifacts

### Step 5: Extract reasoning module (1 hour)

**reasoning-engine.ts**:
- Execute reasoning steps
- Chain thoughts
- Validate reasoning

**chain-of-thought.ts**:
- Generate CoT prompts
- Parse CoT responses
- Format reasoning display

**prompt-templates.ts**:
- All prompt templates
- Template variables
- Template composition

### Step 6: Extract tools module (1 hour)

**tool-executor.ts**:
- Execute tool calls
- Handle tool errors
- Return tool results

**tool-result-parser.ts**:
- Parse tool outputs
- Format results for AI
- Handle errors

### Step 7: Create ai-service.ts coordinator (30 min)

```typescript
// src/main/lib/ai/ai-service.ts
export class AIService {
  private streamProcessor: StreamProcessor
  private agentOrchestrator: AgentOrchestrator
  private reasoningEngine: ReasoningEngine
  private toolExecutor: ToolExecutor

  constructor() {
    this.streamProcessor = new StreamProcessor()
    this.agentOrchestrator = new AgentOrchestrator()
    this.reasoningEngine = new ReasoningEngine()
    this.toolExecutor = new ToolExecutor()
  }

  async generateResponse(params: GenerateParams): Promise<Response> {
    // Coordinate all components
  }
}
```

### Step 8: Update ai.ts router (30 min)

```typescript
// src/main/lib/trpc/routers/ai.ts (now ~100 lines)
import { AIService } from '../../lib/ai/ai-service'

const aiService = new AIService()

export const aiRouter = router({
  generate: publicProcedure
    .input(z.object({ message: z.string(), ... }))
    .mutation(async ({ input, ctx }) => {
      return aiService.generateResponse({
        userId: ctx.userId,
        ...input
      })
    }),

  stream: publicProcedure
    .input(z.object({ ... }))
    .mutation(async ({ input, ctx }) => {
      return aiService.streamResponse({
        userId: ctx.userId,
        ...input
      })
    })
})
```

### Step 9: Test all functionality (45 min)

- Test streaming independently
- Test agent routing
- Test reasoning
- Test tool execution
- Test end-to-end flows

---

## ✅ Acceptance Criteria

- [ ] All ai.ts routes remain functional
- [ ] No breaking changes to API
- [ ] Each module is independently testable
- [ ] Streaming performance unchanged
- [ ] All tests pass
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
// Example unit tests
describe('AIService', () => {
  describe('streaming', () => {
    it('should process stream chunks correctly', async () => {
      const processor = new StreamProcessor()
      const chunks = ['Hello', ' ', 'world']
      const result = await processor.process(chunks)
      expect(result).toBe('Hello world')
    })
  })

  describe('agents', () => {
    it('should route to correct agent', async () => {
      const orchestrator = new AgentOrchestrator()
      const agent = orchestrator.routeMessage('Create a spreadsheet')
      expect(agent.type).toBe('excel-agent')
    })
  })

  describe('reasoning', () => {
    it('should execute chain of thought', async () => {
      const engine = new ReasoningEngine()
      const steps = await engine.reason(prompt)
      expect(steps.length).toBeGreaterThan(0)
    })
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking streaming flow | HIGH | Keep original file until verified |
| Agent context loss | HIGH | Thorough integration testing |
| Performance regression | MEDIUM | Benchmark before/after |
| Circular dependencies | MEDIUM | Document all dependencies upfront |

---

## 📊 Metrics

**Before**:
- File size: 3,620 lines
- Maintainability: 🔴 Poor
- Test coverage: <5%
- Change isolation: Impossible

**After**:
- Largest module: ~400 lines
- Maintainability: 🟢 Excellent
- Test coverage: ~80%
- Change isolation: High

---

## 🔄 Rollback Plan

```bash
# If issues arise, revert:
git checkout HEAD~1 -- src/main/lib/trpc/routers/ai.ts
rm -rf src/main/lib/ai/streaming
rm -rf src/main/lib/ai/agents
rm -rf src/main/lib/ai/reasoning
rm -rf src/main/lib/ai/tools
rm src/main/lib/ai/ai-service.ts
```

---

## 📝 Notes

- AI service is critical path - coordinate with team
- Consider feature branch for this refactoring
- Update AGENTS.md with new architecture
- Document agent flow in diagram

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.1.2
- [AGENTS.md](../../AGENTS.md) - Architecture guidelines
- [AI Architecture](../../AI_ARCHITECTURE.md) - If exists

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
