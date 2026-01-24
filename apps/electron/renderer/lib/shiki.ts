import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

const SUPPORTED_LANGUAGES: BundledLanguage[] = [
    'typescript',
    'javascript',
    'tsx',
    'jsx',
    'html',
    'css',
    'json',
    'python',
    'go',
    'rust',
    'bash',
    'markdown',
    'yaml',
    'sql',
    'diff'
]

const THEMES: BundledTheme[] = [
    'github-dark',
    'github-light',
]

export async function getHighlighter(): Promise<Highlighter> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: THEMES,
            langs: SUPPORTED_LANGUAGES,
        })
    }
    return highlighterPromise
}

export async function highlightCode(
    code: string,
    language: string,
    theme: 'dark' | 'light' = 'dark'
): Promise<string> {
    try {
        const highlighter = await getHighlighter()
        const shikiTheme: BundledTheme = theme === 'light' ? 'github-light' : 'github-dark'

        // Check if language is supported
        const loadedLangs = highlighter.getLoadedLanguages()
        const lang = loadedLangs.includes(language as BundledLanguage)
            ? (language as BundledLanguage)
            : 'plaintext'

        const html = highlighter.codeToHtml(code, {
            lang,
            theme: shikiTheme,
        })

        // Extract just the code content from shiki's output (remove pre/code wrapper)
        const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
        return match ? match[1] : code
    } catch (error) {
        console.error('Failed to highlight code:', error)
        return code
    }
}
