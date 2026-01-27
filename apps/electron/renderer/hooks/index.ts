/**
 * React Hooks - Consolidated exports
 *
 * All application hooks are exported from this module for clean imports:
 *   import { useDebounce, useChatSounds } from '@/hooks'
 *
 * Migration Note: Hooks were consolidated from:
 * - src/renderer/lib/use-*.ts
 * - src/renderer/lib/hooks/
 * - src/renderer/hooks/
 *
 * Feature-specific hooks remain in their feature directories.
 */

// Utility hooks
export { useDebounce } from "./use-debounce";
export { useIsMobile } from "./use-mobile";

// Chat & AI hooks
export { useChatSounds, type ChatSoundType } from "./use-chat-sounds";
export { useSmoothStream } from "./use-smooth-stream";
export { useCitationNavigation } from "./use-citation-navigation";

// Document & File hooks
export {
  useDocumentUpload,
  isDocumentSupported,
  getDocumentAcceptTypes,
  type UploadedDocument,
  type VectorStoreFile,
} from "./use-document-upload";
export {
  useFileUpload,
  type UploadStatus,
  type UploadedImage,
  type UploadedFile,
} from "./use-file-upload";

// Text processing hooks
export {
  useSpellCheck,
  type MisspelledWord,
  type AutocompleteSuggestion,
  type SpellCheckResult,
} from "./use-spell-check";

// Data persistence hooks
export {
  useAutoSave,
  useAutoSaveWithCompare,
  type UseAutoSaveOptions,
  type UseAutoSaveReturn,
} from "./use-auto-save";
