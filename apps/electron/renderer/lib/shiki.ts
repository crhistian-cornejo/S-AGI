import {
    createHighlighter,
    type Highlighter,
    type BundledLanguage,
    type BundledTheme,
} from 'shiki'
import {
    transformerNotationDiff,
    transformerNotationHighlight,
    transformerNotationWordHighlight,
    transformerNotationFocus,
    transformerNotationErrorLevel,
    transformerRenderWhitespace,
    transformerMetaHighlight,
    transformerMetaWordHighlight,
} from '@shikijs/transformers'
import { normalizeLanguageId } from './code-language'

let highlighterPromise: Promise<Highlighter> | null = null

// Core languages loaded at startup (most commonly used)
const CORE_LANGUAGES: BundledLanguage[] = [
    'typescript',
    'javascript',
    'tsx',
    'jsx',
    'html',
    'css',
    'json',
    'python',
    'shellscript',
    'markdown',
    'sql',
    'diff',
]

// Additional languages loaded on demand
const LAZY_LANGUAGES: BundledLanguage[] = [
    'go',
    'rust',
    'yaml',
    'latex',
    'dockerfile',
    'toml',
    'xml',
    'graphql',
    'c',
    'cpp',
    'csharp',
    'java',
    'kotlin',
    'swift',
    'php',
    'ruby',
]

const SUPPORTED_LANGUAGES: BundledLanguage[] = [...CORE_LANGUAGES, ...LAZY_LANGUAGES]

// Only load the 2 primary themes at startup; others loaded on demand
const CORE_THEMES: BundledTheme[] = [
    'github-dark',
    'github-light',
]

const LAZY_THEMES: BundledTheme[] = [
    'one-dark-pro',
    'vitesse-dark',
    'vitesse-light',
    'dracula',
    'nord',
]

const THEMES: BundledTheme[] = [...CORE_THEMES, ...LAZY_THEMES]

// Track which lazy languages/themes have been loaded
const loadedLazyLangs = new Set<string>()
const loadedLazyThemes = new Set<string>()

export async function getHighlighter(): Promise<Highlighter> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: CORE_THEMES,
            langs: CORE_LANGUAGES,
        })
    }
    return highlighterPromise
}

/**
 * Ensure a language grammar is loaded, loading it on demand if needed
 */
async function ensureLanguageLoaded(highlighter: Highlighter, lang: BundledLanguage): Promise<void> {
    if (loadedLazyLangs.has(lang)) return
    const loaded = highlighter.getLoadedLanguages()
    if (loaded.includes(lang)) {
        loadedLazyLangs.add(lang)
        return
    }
    if (LAZY_LANGUAGES.includes(lang)) {
        await highlighter.loadLanguage(lang)
        loadedLazyLangs.add(lang)
    }
}

/**
 * Ensure a theme is loaded, loading it on demand if needed
 */
async function ensureThemeLoaded(highlighter: Highlighter, theme: BundledTheme): Promise<void> {
    if (loadedLazyThemes.has(theme)) return
    const loaded = highlighter.getLoadedThemes()
    if (loaded.includes(theme)) {
        loadedLazyThemes.add(theme)
        return
    }
    if (LAZY_THEMES.includes(theme)) {
        await highlighter.loadTheme(theme)
        loadedLazyThemes.add(theme)
    }
}

export interface HighlightOptions {
    /** Show line numbers */
    lineNumbers?: boolean
    /** Highlight specific lines (1-indexed), e.g., [1, 3, 5] or "1,3,5-7" */
    highlightLines?: number[] | string
    /** Starting line number (default: 1) */
    startLine?: number
    /** Show whitespace characters (space, tab) */
    showWhitespace?: boolean
    /** Word to highlight */
    highlightWord?: string
}

/**
 * Parse highlight lines from string format like "1,3,5-7" to number array
 */
function parseHighlightLines(input: string | number[] | undefined): number[] {
    if (!input) return []
    if (Array.isArray(input)) return input

    const lines: number[] = []
    const parts = input.split(',').map(s => s.trim())

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number)
            for (let i = start; i <= end; i++) {
                lines.push(i)
            }
        } else {
            lines.push(Number(part))
        }
    }

    return lines.filter(n => !isNaN(n))
}

/**
 * Highlight code with full Shiki features
 *
 * Supports special comments in code:
 * - `// [!code ++]` - Mark line as added (diff)
 * - `// [!code --]` - Mark line as removed (diff)
 * - `// [!code highlight]` - Highlight this line
 * - `// [!code highlight:3]` - Highlight this and next 2 lines
 * - `// [!code focus]` - Focus this line (dim others)
 * - `// [!code word:hello]` - Highlight word "hello"
 * - `// [!code error]` - Mark as error
 * - `// [!code warning]` - Mark as warning
 */
export async function highlightCode(
    code: string,
    language: string,
    theme: 'dark' | 'light' = 'dark',
    options: HighlightOptions = {}
): Promise<string> {
    try {
        const highlighter = await getHighlighter()
        const shikiTheme: BundledTheme = theme === 'light' ? 'github-light' : 'github-dark'

        // Normalize language and lazy-load if needed
        const normalized = normalizeLanguageId(language)
        let lang: BundledLanguage | 'text' = 'text'
        if (normalized && SUPPORTED_LANGUAGES.includes(normalized as BundledLanguage)) {
            await ensureLanguageLoaded(highlighter, normalized as BundledLanguage)
            lang = normalized as BundledLanguage
        }

        // Ensure theme is loaded
        await ensureThemeLoaded(highlighter, shikiTheme)

        // Parse highlight lines
        const highlightLines = parseHighlightLines(options.highlightLines)

        // Build transformers array
        const transformers = [
            // Notation-based transformers (work with special comments)
            transformerNotationDiff(),
            transformerNotationHighlight(),
            transformerNotationWordHighlight(),
            transformerNotationFocus(),
            transformerNotationErrorLevel(),
        ]

        // Add whitespace rendering if requested
        if (options.showWhitespace) {
            transformers.push(transformerRenderWhitespace())
        }

        // Add meta highlight if lines specified
        if (highlightLines.length > 0) {
            transformers.push(transformerMetaHighlight())
        }

        // Add word highlight if specified
        if (options.highlightWord) {
            transformers.push(transformerMetaWordHighlight())
        }

        // Generate highlighted HTML
        const html = highlighter.codeToHtml(code, {
            lang,
            theme: shikiTheme,
            transformers,
            meta: {
                ...(highlightLines.length > 0 && {
                    __raw: `{${highlightLines.join(',')}}`,
                }),
                ...(options.highlightWord && {
                    __raw: `/${options.highlightWord}/`,
                }),
            },
        })

        // Extract just the code content (remove pre/code wrapper for embedding)
        const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
        let codeContent = match ? match[1] : html

        // Post-process: Add line numbers if requested
        if (options.lineNumbers) {
            codeContent = addLineNumbersToContent(codeContent, options.startLine || 1)
        }

        return codeContent
    } catch (error) {
        console.error('Failed to highlight code:', error)
        return escapeHtml(code)
    }
}

/**
 * Add line numbers to code content (inner HTML without pre/code wrapper)
 * Uses data-line attribute for CSS-based line numbers
 */
function addLineNumbersToContent(content: string, startLine: number): string {
    // Match all lines in the code
    const lineRegex = /<span class="line">/g
    let lineNum = startLine

    const result = content.replace(lineRegex, () => {
        const num = lineNum++
        // Add data-line attribute for CSS-based line numbers (no span insertion)
        return `<span class="line" data-line="${num}">`
    })

    return result
}

/**
 * Add line numbers to full highlighted HTML (with pre/code wrapper)
 */
function addLineNumbers(html: string, startLine: number): string {
    const lineRegex = /<span class="line">/g
    let lineNum = startLine

    const result = html.replace(lineRegex, () => {
        const num = lineNum++
        return `<span class="line" data-line="${num}">`
    })

    return result
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * Get HTML with full pre/code wrapper (for standalone use)
 */
export async function highlightCodeFull(
    code: string,
    language: string,
    theme: 'dark' | 'light' = 'dark',
    options: HighlightOptions = {}
): Promise<string> {
    try {
        const highlighter = await getHighlighter()
        const shikiTheme: BundledTheme = theme === 'light' ? 'github-light' : 'github-dark'

        // Normalize language and lazy-load if needed
        const normalized = normalizeLanguageId(language)
        let lang: BundledLanguage | 'text' = 'text'
        if (normalized && SUPPORTED_LANGUAGES.includes(normalized as BundledLanguage)) {
            await ensureLanguageLoaded(highlighter, normalized as BundledLanguage)
            lang = normalized as BundledLanguage
        }

        // Ensure theme is loaded
        await ensureThemeLoaded(highlighter, shikiTheme)

        const transformers = [
            transformerNotationDiff(),
            transformerNotationHighlight(),
            transformerNotationWordHighlight(),
            transformerNotationFocus(),
            transformerNotationErrorLevel(),
        ]

        if (options.showWhitespace) {
            transformers.push(transformerRenderWhitespace())
        }

        let html = highlighter.codeToHtml(code, {
            lang,
            theme: shikiTheme,
            transformers,
        })

        // Add line numbers class to pre if needed
        if (options.lineNumbers) {
            html = html.replace('<pre', '<pre data-line-numbers')
            html = addLineNumbers(html, options.startLine || 1)
        }

        return html
    } catch (error) {
        console.error('Failed to highlight code:', error)
        return `<pre><code>${escapeHtml(code)}</code></pre>`
    }
}

/**
 * Get list of available themes
 */
export function getAvailableThemes(): BundledTheme[] {
    return [...THEMES]
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): BundledLanguage[] {
    return [...SUPPORTED_LANGUAGES]
}
