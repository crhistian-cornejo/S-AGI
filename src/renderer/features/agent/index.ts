// Agent UI Components
// Visual components for displaying AI agent tool executions

// Core components and utilities
export { AgentToolCall } from './agent-tool-call'
export { 
  AgentToolRegistry, 
  getToolStatus, 
  type ToolPart, 
  type ToolMeta, 
  type ToolVariant 
} from './agent-tool-registry'

// Icons
export {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
  ExternalLinkIcon,
  CustomTerminalIcon,
  GlobeIcon,
  SearchIcon,
  SparklesIcon,
  PlanningIcon,
  IconEditFile,
  WriteFileIcon,
  EyeIcon,
  BrainIcon,
  CodeIcon,
  FileSearchIcon,
  TableIcon,
} from './icons'

// Tool-specific components
export { AgentBash } from './agent-bash'
export type { BashToolResult, AgentBashProps_Legacy } from './agent-bash'

export { AgentWebFetch } from './agent-web-fetch'
export type { WebFetchResult, AgentWebFetchProps_Legacy } from './agent-web-fetch'

export { AgentWebSearch, ConsolidatedWebSearch } from './agent-web-search'
export type { WebSearchResult, AgentWebSearchProps_Legacy } from './agent-web-search'

export { AgentFileSearch } from './agent-file-search'

export { AgentPlan } from './agent-plan'
export type { AgentPlanProps, PlanStep } from './agent-plan'

export { AgentTask } from './agent-task'
export type { TaskResult, AgentTaskProps_Legacy } from './agent-task'

export { AgentEdit } from './agent-edit'
export type { AgentEditProps, EditResult } from './agent-edit'

export { AgentReasoning } from './agent-reasoning'
export type { AgentReasoningProps, AgentReasoningAction, WebSearchData, UrlCitationData } from './agent-reasoning'

// Planning and Todo components
export { AgentTodoTool } from './agent-todo-tool'
export { AgentExitPlanModeTool } from './agent-exit-plan-mode-tool'
export { AgentToolCallsGroup } from './agent-tool-calls-group'
