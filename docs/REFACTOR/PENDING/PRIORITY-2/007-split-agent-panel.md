# 🟠 PRIORITY 2: Split agent-panel.tsx

**Status**: 🟡 PENDING  
**Severity**: 🟠 HIGH  
**Estimated Time**: 4-5 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Current File**: `src/renderer/features/agent/agent-panel.tsx`  
**Current Lines**: **1,104**  
**Problem**: Monolithic component mixing multiple responsibilities - rendering, streaming, image handling, model selection, input management, keyboard events, and 10 inline sub-components.

---

## 🎯 Objectives

1. Split agent-panel into ~8 focused sub-components
2. Extract custom hooks to separate files
3. Improve maintainability and testability
4. Keep main component under 200 lines

---

## 📁 Current Responsibilities

1. **Message rendering** - Display agent messages
2. **Streaming logic** - Handle real-time streaming
3. **Image handling** - Upload, preview, remove images
4. **Model selection** - Select AI model
5. **Input management** - Text input, textarea, send button
6. **Keyboard events** - Enter key, shortcuts
7. **Tool call UI** - Display tool calls and status
8. **Toolbar** - Actions and controls

---

## 🔍 Inline Components to Extract

1. **ToolCallStatus** (~80 lines) - Display tool call status
2. **AgentMessage** (~120 lines) - Render agent message
3. **ImagePreview** (~60 lines) - Preview uploaded images
4. **ModelSelector** (~100 lines) - Select AI model dropdown
5. **AgentToolbar** (~90 lines) - Toolbar with actions
6. **StreamingIndicator** (~40 lines) - Show streaming status
7. **MessageInput** (~200 lines) - Input textarea and send button
8. **ToolCallAccordion** (~150 lines) - Expandable tool call details
9. **ImageUploader** (~80 lines) - Image upload button
10. **KeyboardShortcuts** (~50 lines) - Handle keyboard events

---

## 🔧 Implementation Plan

### Step 1: Create component directories (5 min)

```bash
mkdir -p src/renderer/features/agent/components
mkdir -p src/renderer/features/agent/hooks
```

### Step 2: Extract hooks (1.5 hours)

#### Create `hooks/use-agent-streaming.ts`

```typescript
// src/renderer/features/agent/hooks/use-agent-streaming.ts
import { useState, useCallback } from 'react'

interface StreamingState {
  isStreaming: boolean
  currentMessage: string
  toolCalls: ToolCall[]
}

export function useAgentStreaming() {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    currentMessage: '',
    toolCalls: []
  })

  const startStreaming = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      currentMessage: message
    }))
  }, [])

  const stopStreaming = useCallback(() => {
    setState(prev => ({
      ...prev,
      isStreaming: false,
      currentMessage: ''
    }))
  }, [])

  const appendChunk = useCallback((chunk: string) => {
    setState(prev => ({
      ...prev,
      currentMessage: prev.currentMessage + chunk
    }))
  }, [])

  const addToolCall = useCallback((toolCall: ToolCall) => {
    setState(prev => ({
      ...prev,
      toolCalls: [...prev.toolCalls, toolCall]
    }))
  }, [])

  const clearToolCalls = useCallback(() => {
    setState(prev => ({ ...prev, toolCalls: [] }))
  }, [])

  return {
    ...state,
    startStreaming,
    stopStreaming,
    appendChunk,
    addToolCall,
    clearToolCalls
  }
}
```

#### Create `hooks/use-agent-input.ts`

```typescript
// src/renderer/features/agent/hooks/use-agent-input.ts
import { useState, useCallback, useRef, useEffect } from 'react'

export function useAgentInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isComposing, setIsComposing] = useState(false)

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      // Handle send
    }
  }, [isComposing])

  const clearInput = useCallback(() => {
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  const autoResize = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [])

  return {
    input,
    setInput,
    textareaRef,
    isComposing,
    setIsComposing,
    handleInputChange,
    handleKeyDown,
    clearInput,
    autoResize
  }
}
```

### Step 3: Extract components (2 hours)

#### Create `components/tool-call-status.tsx`

```typescript
// src/renderer/features/agent/components/tool-call-status.tsx
import { IconLoader, IconCheck, IconX } from '@tabler/icons-react'

interface ToolCallStatusProps {
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolName: string
}

export function ToolCallStatus({ status, toolName }: ToolCallStatusProps) {
  const icons = {
    pending: <IconLoader size={16} className="animate-spin" />,
    running: <IconLoader size={16} className="animate-spin" />,
    completed: <IconCheck size={16} className="text-green-500" />,
    failed: <IconX size={16} className="text-red-500" />
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {icons[status]}
      <span>{toolName}</span>
    </div>
  )
}
```

#### Create `components/agent-message.tsx`

```typescript
// src/renderer/features/agent/components/agent-message.tsx
import { MarkdownRenderer } from '@/components/chat-markdown-renderer'

interface AgentMessageProps {
  content: string
  toolCalls?: ToolCall[]
}

export function AgentMessage({ content, toolCalls }: AgentMessageProps) {
  return (
    <div className="space-y-2">
      <MarkdownRenderer content={content} />
      {toolCalls && toolCalls.length > 0 && (
        <ToolCallAccordion toolCalls={toolCalls} />
      )}
    </div>
  )
}
```

#### Create `components/image-preview.tsx`

```typescript
// src/renderer/features/agent/components/image-preview.tsx'
import { IconX } from '@tabler/icons-react'

interface ImagePreviewProps {
  images: UploadedImage[]
  onRemove: (id: string) => void
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {images.map(image => (
        <div key={image.id} className="relative group">
          <img
            src={image.preview}
            alt={image.name}
            className="h-20 w-20 object-cover rounded-lg"
          />
          <button
            onClick={() => onRemove(image.id)}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
```

#### Create `components/model-selector.tsx`

```typescript
// src/renderer/features/agent/components/model-selector.tsx
import { IconChevronDown } from '@tabler/icons-react'

interface ModelSelectorProps {
  selectedModel: string
  models: Model[]
  onSelect: (model: string) => void
}

export function ModelSelector({ selectedModel, models, onSelect }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-100"
      >
        <span>{selectedModel}</span>
        <IconChevronDown size={16} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1">
          {models.map(model => (
            <button
              key={model.id}
              onClick={() => {
                onSelect(model.id)
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-100"
            >
              {model.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

#### Create `components/message-input.tsx`

```typescript
// src/renderer/features/agent/components/message-input.tsx
import { IconSend } from '@tabler/icons-react'

interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onComposeStart: () => void
  onComposeEnd: () => void
  disabled?: boolean
  textareaRef: RefObject<HTMLTextAreaElement>
  onResize: () => void
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onComposeStart,
  onComposeEnd,
  disabled,
  textareaRef,
  onResize
}: MessageInputProps) {
  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={onComposeStart}
        onCompositionEnd={onComposeEnd}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
            e.preventDefault()
            onSend()
          }
        }}
        className="w-full resize-none rounded-lg border px-4 py-3 pr-12 focus:outline-none focus:ring-2"
        placeholder="Type your message..."
        disabled={disabled}
        rows={1}
        style={{ minHeight: '44px' }}
      />

      <button
        onClick={onSend}
        disabled={!value.trim() || disabled}
        className="absolute right-2 bottom-2 p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <IconSend size={16} />
      </button>
    </div>
  )
}
```

#### Create `components/tool-call-accordion.tsx`

```typescript
// src/renderer/features/agent/components/tool-call-accordion.tsx'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'

interface ToolCallAccordionProps {
  toolCalls: ToolCall[]
}

export function ToolCallAccordion({ toolCalls }: ToolCallAccordionProps) {
  const [expandedCall, setExpandedCall] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {toolCalls.map(call => (
        <div key={call.id} className="border rounded-lg">
          <button
            onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
          >
            <ToolCallStatus status={call.status} toolName={call.name} />
            {expandedCall === call.id ? (
              <IconChevronDown size={16} />
            ) : (
              <IconChevronRight size={16} />
            )}
          </button>

          {expandedCall === call.id && (
            <div className="px-3 py-2 border-t">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(call, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

### Step 4: Refactor main component (30 min)

```typescript
// src/renderer/features/agent/agent-panel.tsx (now ~150 lines)
import { useAgentStreaming } from './hooks/use-agent-streaming'
import { useAgentInput } from './hooks/use-agent-input'
import { AgentMessage } from './components/agent-message'
import { ImagePreview } from './components/image-preview'
import { ModelSelector } from './components/model-selector'
import { MessageInput } from './components/message-input'
import { ToolCallAccordion } from './components/tool-call-accordion'

export function AgentPanel() {
  const streaming = useAgentStreaming()
  const input = useAgentInput()

  const handleSend = useCallback(() => {
    if (!input.input.trim()) return

    // Send message logic
    streaming.startStreaming(input.input)
    input.clearInput()
  }, [input.input, streaming])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <ModelSelector
          selectedModel={selectedModel}
          models={availableModels}
          onSelect={setSelectedModel}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map(message => (
          <AgentMessage
            key={message.id}
            content={message.content}
            toolCalls={message.toolCalls}
          />
        ))}
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3">
        <ImagePreview
          images={uploadedImages}
          onRemove={removeImage}
        />
        <MessageInput
          value={input.input}
          onChange={input.handleInputChange}
          onSend={handleSend}
          onComposeStart={input.setIsComposing.bind(null, true)}
          onComposeEnd={input.setIsComposing.bind(null, false)}
          disabled={streaming.isStreaming}
          textareaRef={input.textareaRef}
          onResize={input.autoResize}
        />
      </div>
    </div>
  )
}
```

### Step 5: Test all components (30 min)

- Test streaming behavior
- Test input handling
- Test image upload
- Test model selection
- Test tool call display
- Test keyboard shortcuts
- Test accessibility

---

## ✅ Acceptance Criteria

- [ ] agent-panel.tsx under 200 lines
- [ ] All sub-components extracted
- [ ] All hooks extracted
- [ ] No inline components remaining
- [ ] All tests pass
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
describe('AgentPanel', () => {
  describe('useAgentStreaming', () => {
    it('should start streaming', () => {
      const { startStreaming, isStreaming } = renderHook(() => useAgentStreaming()).result.current
      startStreaming('Hello')
      expect(isStreaming).toBe(true)
    })

    it('should append chunks', () => {
      const { appendChunk, currentMessage } = renderHook(() => useAgentStreaming()).result.current
      appendChunk('Hello')
      appendChunk(' world')
      expect(currentMessage).toBe('Hello world')
    })
  })

  describe('useAgentInput', () => {
    it('should handle enter key', () => {
      const { handleKeyDown, setInput } = renderHook(() => useAgentInput()).result.current
      setInput('Test')
      const enterEvent = { key: 'Enter', preventDefault: jest.fn() } as any
      handleKeyDown(enterEvent)
      expect(enterEvent.preventDefault).toHaveBeenCalled()
    })
  })

  describe('MessageInput', () => {
    it('should send on enter', () => {
      const onSend = jest.fn()
      render(<MessageInput value="Test" onChange={jest.fn()} onSend={onSend} {...otherProps} />)
      // Simulate enter key
      expect(onSend).toHaveBeenCalled()
    })
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| State management complexity | HIGH | Use custom hooks to manage state |
| Component prop drilling | MEDIUM | Use context if needed |
| Breaking existing functionality | MEDIUM | Thorough testing of all flows |
| Performance regression | LOW | Should improve performance |

---

## 📊 Metrics

**Before**:
- File size: 1,104 lines
- Inline components: 10
- Maintainability: 🔴 Poor

**After**:
- Main component: ~150 lines
- Sub-components: 8 files (~200 lines each)
- Hooks: 2 files (~100 lines each)
- Maintainability: 🟢 Excellent

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/renderer/features/agent/
rm -rf src/renderer/features/agent/components
rm -rf src/renderer/features/agent/hooks
```

---

## 📝 Notes

- Keep components focused on single responsibility
- Use custom hooks for state management
- Consider context for deeply nested state
- Document component APIs
- Use TypeScript for type safety

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.1.5
- [AGENTS.md](../../AGENTS.md) - Component guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
