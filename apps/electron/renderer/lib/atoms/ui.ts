/**
 * UI Atoms
 *
 * State management for UI:
 * - Sidebar state
 * - Theme state
 * - Tab system
 * - Modals & dialogs
 * - Settings
 * - Sound effects
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// === SIDEBAR STATE ===

export const sidebarOpenAtom = atomWithStorage('sidebar-open', true)
export const sidebarWidthAtom = atomWithStorage('sidebar-width', 280)

// === TAB SYSTEM ===

export type AppTab =
  | 'chat'
  | 'excel'
  | 'doc'
  | 'gallery'
  | 'pdf'
  | 'ideas'
  | 'settings'
export const activeTabAtom = atomWithStorage<AppTab>('active-tab', 'chat')

/** When navigating into Settings, store where to return. */
export const settingsReturnTabAtom = atom<AppTab>('chat')

// === THEME STATE ===

export const themeAtom = atomWithStorage<'system' | 'light' | 'dark'>(
  'theme',
  'system'
)

// === FULL VS CODE THEME ATOMS ===

export type VSCodeFullTheme = {
  id: string
  name: string
  type: 'light' | 'dark'
  colors: Record<string, string>
  source: 'builtin' | 'imported'
}

/** Selected full theme ID (null = use system light/dark) */
export const selectedFullThemeIdAtom = atomWithStorage<string | null>(
  'preferences:selected-full-theme-id',
  null
)

/** Theme to use when system is in light mode */
export const systemLightThemeIdAtom = atomWithStorage<string>(
  'preferences:system-light-theme-id',
  'sagi-light'
)

/** Theme to use when system is in dark mode */
export const systemDarkThemeIdAtom = atomWithStorage<string>(
  'preferences:system-dark-theme-id',
  'sagi-dark'
)

/** Cached full theme data for the selected theme */
export const fullThemeDataAtom = atom<VSCodeFullTheme | null>(null)

// === SETTINGS MODAL ===

export const settingsModalOpenAtom = atom(false)
export type SettingsTab =
  | 'account'
  | 'archived-chats'
  | 'appearance'
  | 'api-keys'
  | 'advanced'
  | 'shortcuts'
  | 'debug'
  | 'usage'
  | 'pdf-ocr'
export const settingsActiveTabAtom = atom<SettingsTab>('account')

// === HELP & SHORTCUTS ===

export const shortcutsDialogOpenAtom = atom(false)
export const aboutDialogOpenAtom = atom(false)

// === COMMAND K / QUICK SEARCH ===

export const commandKOpenAtom = atom(false)

// === AUTH DIALOG ===

export const authDialogOpenAtom = atom(false)
export const authDialogModeAtom = atom<'signin' | 'signup'>('signin')
export const onboardingCompletedAtom = atomWithStorage(
  'onboarding-completed',
  false
)

// === MULTI-ACCOUNT STATE ===

/** Account info from the multi-account store */
export interface AccountInfo {
  id: string
  userId: string
  email: string
  displayName: string
  avatarUrl?: string
  isLocal: boolean
  provider?: string
  connectedAt: number
  isActive: boolean
}

/** UI state for account switcher popover */
export const accountSwitcherOpenAtom = atom(false)

/** Add account dialog mode - for adding new accounts */
export const addAccountDialogOpenAtom = atom(false)

// === SOUND EFFECTS ===

export const chatSoundsEnabledAtom = atomWithStorage(
  'chat-sounds-enabled',
  true
)

// === IMAGE GENERATION MODE ===

export const isImageGenerationModeAtom = atom(false)

export type ImageAspectRatio = 'square' | 'landscape' | 'portrait'
export const imageAspectRatioAtom = atomWithStorage<ImageAspectRatio>(
  'image-aspect-ratio',
  'square'
)

export const ASPECT_RATIO_TO_SIZE: Record<ImageAspectRatio, string> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
}

export const ASPECT_RATIO_LABELS: Record<ImageAspectRatio, string> = {
  square: '1:1',
  landscape: '3:2',
  portrait: '2:3',
}

// === IMAGE EDIT DIALOG STATE ===

export interface ImageEditDialogState {
  isOpen: boolean
  imageUrl: string
  originalPrompt: string
}

export const imageEditDialogAtom = atom<ImageEditDialogState>({
  isOpen: false,
  imageUrl: '',
  originalPrompt: '',
})

// === ZEN MODE ===

export const zenModeAtom = atomWithStorage('zen-mode', false)

// === FILE SIDEBARS ===

export const excelSidebarOpenAtom = atomWithStorage('excel-sidebar-open', true)
export const docSidebarOpenAtom = atomWithStorage('doc-sidebar-open', true)

// === TYPOGRAPHY SETTINGS ===

export type FontFamily = 'system' | 'inter' | 'geist' | 'jetbrains-mono' | 'fira-code' | 'roboto'

export const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string; fontFamily: string }[] = [
  { value: 'system', label: 'System Default', fontFamily: 'system-ui, -apple-system, sans-serif' },
  { value: 'inter', label: 'Inter', fontFamily: '"Inter", system-ui, sans-serif' },
  { value: 'geist', label: 'Geist', fontFamily: '"Geist", system-ui, sans-serif' },
  { value: 'roboto', label: 'Roboto', fontFamily: '"Roboto", system-ui, sans-serif' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono', fontFamily: '"JetBrains Mono", monospace' },
  { value: 'fira-code', label: 'Fira Code', fontFamily: '"Fira Code", monospace' },
]

export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export const FONT_SIZE_OPTIONS: { value: FontSize; label: string; size: string }[] = [
  { value: 'xs', label: 'Extra Small', size: '13px' },
  { value: 'sm', label: 'Small', size: '14px' },
  { value: 'md', label: 'Medium (Default)', size: '15px' },
  { value: 'lg', label: 'Large', size: '16px' },
  { value: 'xl', label: 'Extra Large', size: '17px' },
]

/** UI Font Family */
export const uiFontFamilyAtom = atomWithStorage<FontFamily>(
  'preferences:ui-font-family',
  'inter'
)

/** Primary/Body Font Size */
export const primaryFontSizeAtom = atomWithStorage<FontSize>(
  'preferences:primary-font-size',
  'md'
)

/** Secondary/Muted Font Size (labels, hints, etc.) */
export const secondaryFontSizeAtom = atomWithStorage<FontSize>(
  'preferences:secondary-font-size',
  'sm'
)

// === AUTO-UPDATE STATE ===

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

export const updateStatusAtom = atom<UpdateStatus>('idle')
export const updateVersionAtom = atom<string | null>(null)
export const updateDownloadPercentAtom = atom<number>(0)
export const updateErrorAtom = atom<string | null>(null)

// === GLM-OCR SETTINGS ===

/** Enable GLM-OCR for advanced PDF extraction */
export const glmOcrEnabledAtom = atomWithStorage(
  'preferences:glm-ocr-enabled',
  false
)

/** Auto-detect PDFs that would benefit from OCR */
export const glmOcrAutoDetectAtom = atomWithStorage(
  'preferences:glm-ocr-auto-detect',
  true
)

/** Automatically process with OCR without asking (when enabled + high confidence) */
export const glmOcrAutoProcessAtom = atomWithStorage(
  'preferences:glm-ocr-auto-process',
  false
)
