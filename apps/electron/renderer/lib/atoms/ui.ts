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

export type AppTab = 'chat' | 'excel' | 'doc' | 'gallery' | 'pdf' | 'ideas'
export const activeTabAtom = atomWithStorage<AppTab>('active-tab', 'chat')

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
  | 'appearance'
  | 'api-keys'
  | 'advanced'
  | 'shortcuts'
  | 'debug'
  | 'usage'
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

// === FILE SIDEBARS ===

export const excelSidebarOpenAtom = atomWithStorage('excel-sidebar-open', true)
export const docSidebarOpenAtom = atomWithStorage('doc-sidebar-open', true)
