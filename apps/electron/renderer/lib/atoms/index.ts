/**
 * Atoms Index - Re-exports from Domain Files
 *
 * This file re-exports all atoms from domain-specific files.
 * Import from here for convenience, or import directly from domain files
 * for better tree-shaking.
 *
 * Structure:
 * ├── chat.ts        # Chat selection, input, mode, todos, undo
 * ├── ai.ts          # Provider, model, streaming, reasoning, auth
 * ├── ui.ts          # Sidebar, theme, tabs, modals, settings
 * ├── artifacts.ts   # Artifact selection, panel, snapshot cache
 * ├── agent-panel.ts # Agent panel state, messages, config
 * ├── notes.ts       # Notes state, tabs, editor
 * ├── pdf.ts         # PDF tab state, bookmarks, search
 * └── user-files.ts  # User files, versions, file browser
 */

// === CHAT STATE ===
export {
  // Selection
  selectedChatIdAtom,
  selectedChatAtom,
  // Input
  chatInputAtom,
  pendingQuickPromptMessageAtom,
  // Mode
  chatModeAtom,
  isPlanModeAtom,
  pendingPlanApprovalsAtom,
  // Todos
  type TodoItem,
  getTodosAtom,
  // Undo
  type UndoItem,
  undoStackAtom,
} from './chat'

// === AI STATE ===
export {
  // Provider & Model
  currentProviderAtom,
  selectedModelAtom,
  tavilyApiKeyAtom,
  availableModelsAtom,
  allModelsGroupedAtom,
  currentModelAtom,
  supportsReasoningAtom,
  // API Key Status
  hasOpenaiKeyAtom,
  hasAnthropicKeyAtom,
  hasZaiKeyAtom,
  hasChatGPTPlusAtom,
  chatGPTPlusStatusAtom,
  type ChatGPTPlusStatus,
  hasGeminiAdvancedAtom,
  geminiAdvancedStatusAtom,
  type GeminiAdvancedStatus,
  openaiApiKeyAtom,
  anthropicApiKeyAtom,
  // Connection
  aiConnectionStatusAtom,
  // Streaming
  isStreamingAtom,
  streamingToolCallsAtom,
  streamingErrorAtom,
  // Reasoning
  streamingReasoningAtom,
  isReasoningAtom,
  lastReasoningAtom,
  type ReasoningEffort,
  reasoningEffortAtom,
  responseModeAtom,
  type ResponseMode,
  // Web Search
  type WebSearchInfo,
  type UrlCitation,
  type FileCitation,
  type Annotation,
  streamingWebSearchesAtom,
  streamingAnnotationsAtom,
  // File Search
  type FileSearchInfo,
  streamingFileSearchesAtom,
  // Document Citations
  type DocumentCitation,
  streamingDocumentCitationsAtom,
  streamingSuggestionsAtom,
  // Auth Refresh
  authRefreshingAtom,
  type AuthError,
  authErrorsAtom,
  isAnyAuthRefreshingAtom,
  setAuthRefreshingAtom,
  setAuthErrorAtom,
  // Legacy
  isLoadingAtom,
  claudeCodeConnectedAtom,
} from './ai'

// === UI STATE ===
export {
  // Sidebar
  sidebarOpenAtom,
  sidebarWidthAtom,
  // Tabs
  type AppTab,
  activeTabAtom,
  // Theme
  themeAtom,
  type VSCodeFullTheme,
  selectedFullThemeIdAtom,
  systemLightThemeIdAtom,
  systemDarkThemeIdAtom,
  fullThemeDataAtom,
  // Settings
  settingsModalOpenAtom,
  type SettingsTab,
  settingsActiveTabAtom,
  // Dialogs
  shortcutsDialogOpenAtom,
  commandKOpenAtom,
  authDialogOpenAtom,
  authDialogModeAtom,
  onboardingCompletedAtom,
  // Sound
  chatSoundsEnabledAtom,
  // Image Generation
  isImageGenerationModeAtom,
  type ImageAspectRatio,
  imageAspectRatioAtom,
  ASPECT_RATIO_TO_SIZE,
  ASPECT_RATIO_LABELS,
  type ImageEditDialogState,
  imageEditDialogAtom,
  // File Sidebars
  excelSidebarOpenAtom,
  docSidebarOpenAtom,
} from './ui'

// === ARTIFACT STATE ===
export {
  selectedArtifactIdAtom,
  selectedArtifactAtom,
  artifactPanelOpenAtom,
  artifactPanelWidthAtom,
  type ArtifactSnapshot,
  artifactSnapshotCacheAtom,
  getArtifactSnapshotAtom,
} from './artifacts'

// === AGENT PANEL STATE ===
export {
  type AgentPanelMessage,
  type AgentPanelConfig,
  agentPanelOpenAtom,
  agentPanelWidthAtom,
  agentPanelMessagesAtom,
  getAgentMessagesAtom,
  agentPanelConfigAtom,
  agentPanelStreamingAtom,
  agentPanelStreamingTextAtom,
  type AgentPanelImageAttachment,
  agentPanelImagesAtom,
} from './agent-panel'

// === NOTES STATE ===
export {
  selectedNotePageIdAtom,
  notesSidebarOpenAtom,
  notePagesCacheAtom,
  openNoteTabsAtom,
  notesSelectedModelIdAtom,
  notesEditorRefAtom,
  notesIsExportingPdfAtom,
  createNotePageActionAtom,
  notesPageUpdatedAtom,
} from './notes'

// === PDF TAB ATOMS ===
export {
  selectedPdfAtom,
  pdfCurrentPageAtom,
  pdfZoomLevelAtom,
  pdfNavigationRequestAtom,
  pdfSidebarOpenAtom,
  pdfChatMessagesAtom,
  pdfChatStreamingAtom,
  pdfChatPanelOpenAtom,
  pdfSelectedTextAtom,
  pdfHasExtractedContentAtom,
  pdfTotalWordCountAtom,
  // Local PDFs
  localPdfsAtom,
  addLocalPdfAtom,
  removeLocalPdfAtom,
  clearLocalPdfsAtom,
  localPdfBlobCacheAtom,
  getLocalPdfBlobAtom,
  setLocalPdfBlobAtom,
  // Bookmarks
  pdfOutlineAtom,
  pdfUserBookmarksAtom,
  pdfAllBookmarksAtom,
  pdfBookmarkNavigationAtom,
  // Search
  pdfSearchQueryAtom,
  pdfSearchResultsAtom,
  pdfSearchCurrentIndexAtom,
  pdfSearchLoadingAtom,
  pdfSearchPanelOpenAtom,
  // Save state
  pdfHasUnsavedChangesAtom,
  pdfLastSaveAtom,
  pdfSaveStatusAtom,
  // Source highlights
  activeSourceHighlightsAtom,
  addSourceHighlightAtom,
  removeSourceHighlightAtom,
  clearSourceHighlightsAtom,
  // Helpers
  createPdfSourceFromArtifact,
  createPdfSourceFromChatFile,
  createPdfSourceFromLocalFile,
  // Types
  type PdfSource,
  type PdfChatMessage,
  type PdfNavigationRequest,
  type PdfBookmark,
  type PdfSearchResult,
  type SourceHighlight,
  type HighlightBoundingBox,
} from './pdf'

// === USER FILES STATE ===
export {
  // Types
  type UserFileType,
  type UserFile,
  type FileVersion,
  type FileSnapshot,
  // Current file atoms
  currentExcelFileIdAtom,
  currentDocFileIdAtom,
  currentNoteFileIdAtom,
  currentExcelFileAtom,
  currentDocFileAtom,
  currentNoteFileAtom,
  // Helpers
  getFileIdAtom,
  getFileAtom,
  // Snapshot cache
  fileSnapshotCacheAtom,
  getFileSnapshotAtom,
  // Scratch session IDs
  excelScratchSessionIdAtom,
  docScratchSessionIdAtom,
  // Saving state
  fileSavingAtom,
  isFileSavingAtom,
  // Version history
  versionHistoryOpenAtom,
  versionHistoryFileIdAtom,
  versionHistoryPreviewVersionAtom,
  // File lists
  excelFilesListAtom,
  docFilesListAtom,
  noteFilesListAtom,
  getFilesListAtom,
  // UI state
  fileBrowserOpenAtom,
  fileBrowserWidthAtom,
  fileSearchQueryAtom,
  fileFilterTypeAtom,
  fileShowArchivedAtom,
  // Derived atoms
  hasUnsavedChangesAtom,
  dirtyFileIdsAtom,
  getCurrentFileAtom,
} from './user-files'
