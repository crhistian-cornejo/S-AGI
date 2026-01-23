import { memo, useState, useCallback, useEffect, useMemo, useRef, type ReactNode, Fragment } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import katex from 'katex'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { IconCopy, IconCheck, IconExternalLink } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { InlineCitation, type CitationData } from '@/components/inline-citation'
import { useCitationNavigation } from '@/lib/hooks/use-citation-navigation'

import 'katex/dist/katex.min.css'

// Inline code that looks like LaTeX (e.g. model put equation in backticks) -> try KaTeX
const LATEX_LIKE = /\\(int|frac|sqrt|sum|infty|pi|alpha|beta|gamma|theta|sigma|omega|partial|lim|log|cdot|times|pm|leq|geq|neq|approx|rightarrow|leftarrow)\\b|\\^\\{|_\\{|∞|√|∫/
function getText(children: ReactNode): string {
    if (typeof children === 'string') return children
    if (Array.isArray(children)) return children.map(getText).join('')
    return ''
}
function normalizeLatex(s: string): string {
    return s
        .replace(/√π/g, '\\sqrt{\\pi}')
        .replace(/√2/g, '\\sqrt{2}')
        .replace(/√\(([^)]+)\)/g, '\\sqrt{$1}')
        .replace(/√(\d+)/g, '\\sqrt{$1}')
        .replace(/√/g, '\\sqrt{}')
        .replace(/ί/g, 'i')
        .replace(/π/g, '\\pi')
        .replace(/∞/g, '\\infty')
        .replace(/\^\(([^)]+)\)/g, '^{$1}')
        .replace(/^f_\{-/, '\\int_{-')
        .replace(/^f_\{/, '\\int_{')
}
function tryRenderLatex(text: string): string | null {
    if (!text || text.length > 280) return null
    if (!LATEX_LIKE.test(text)) return null
    const normalized = normalizeLatex(text)
    try {
        return katex.renderToString(normalized, { throwOnError: false, displayMode: false })
    } catch {
        return null
    }
}

// ============================================================================
// Code Block Component with Premium Styling
// Uses ref to extract code text for copy functionality
// ============================================================================

function CodeBlock({ children }: { children: React.ReactNode }) {
    const preRef = useRef<HTMLPreElement>(null)
    const [codeText, setCodeText] = useState('')
    const [language, setLanguage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    // Extract code text and language from the DOM after render
    useEffect(() => {
        if (preRef.current) {
            const codeElement = preRef.current.querySelector('code')
            if (codeElement) {
                // Extract text content
                const text = codeElement.textContent || ''
                setCodeText(text.trim())
                
                // Extract language from className (language-xxx)
                const className = codeElement.className || ''
                const match = /language-(\w+)/.exec(className)
                setLanguage(match ? match[1] : null)
            }
        }
    }, [])
    const handleCopy = useCallback(() => {
        if (!codeText) return
        navigator.clipboard.writeText(codeText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [codeText])

    return (
        <div className="relative my-4 rounded-xl bg-[#1a1a1a] dark:bg-[#0d0d0d] border border-border/30 overflow-hidden shadow-sm group">
            {/* Header with language label and copy button */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#232323] dark:bg-[#141414] border-b border-border/20">
                <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {language || 'text'}
                </span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                    title={copied ? 'Copied!' : 'Copy code'}
                    disabled={!codeText}
                >
                    {copied ? (
                        <IconCheck size={14} className="text-green-500" />
                    ) : (
                        <IconCopy size={14} className="text-muted-foreground/60" />
                    )}
                </button>
            </div>
            {/* Code content - Streamdown handles syntax highlighting via Shiki */}
            <pre 
                ref={preRef}
                className="overflow-x-auto text-[13px] leading-relaxed font-mono p-4 [&_code]:bg-transparent [&_code]:p-0"
            >
                {children}
            </pre>
        </div>
    )
}

// ============================================================================
// Link Preview Component
// ============================================================================

const PREVIEW_WIDTH = 240
const PREVIEW_HEIGHT = 150
const PREVIEW_CACHE_TTL = 5 * 60 * 1000
const previewCache = new Map<string, { status: 'ok' | 'error'; timestamp: number }>()

function isExternalLink(href?: string) {
    return Boolean(href && (href.startsWith('http://') || href.startsWith('https://')))
}

function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url.length > 40 ? url.slice(0, 37) + '…' : url
    }
}

/** Si el texto del enlace es la URL completa o parece una URL, usamos etiqueta corta (dominio) */
function shouldUseShortLabel(href: string | undefined, linkText: string): boolean {
    if (!href || !linkText || linkText.length < 15) return false
    if (linkText === href) return true
    if (/^https?:\/\//i.test(linkText)) return true
    if (linkText.length > 45 && /[./]/.test(linkText)) return true
    return false
}

function getPreviewUrl(url: string) {
    const params = new URLSearchParams({
        url,
        screenshot: 'true',
        meta: 'false',
        embed: 'screenshot.url',
        colorScheme: 'dark',
        'viewport.isMobile': 'true',
        'viewport.deviceScaleFactor': '1',
        'viewport.width': `${Math.round(PREVIEW_WIDTH * 2.5)}`,
        'viewport.height': `${Math.round(PREVIEW_HEIGHT * 2.5)}`
    })

    return `https://api.microlink.io/?${params.toString()}`
}

function useVisibility(ref: React.RefObject<HTMLElement | null>) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (!ref.current) return
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        )
        observer.observe(ref.current)
        return () => observer.disconnect()
    }, [ref])

    return isVisible
}

function LinkWithPreview({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const [open, setOpen] = useState(false)
    const [shouldLoad, setShouldLoad] = useState(false)
    const [hasError, setHasError] = useState(false)
    const triggerRef = useRef<HTMLAnchorElement>(null)
    const isVisible = useVisibility(triggerRef)

    const linkText = getText(children)
    const useShort = isExternalLink(href) && shouldUseShortLabel(href, linkText)
    const display = useShort && href ? getDomain(href) : children

    const previewUrl = useMemo(() => (href ? getPreviewUrl(href) : ''), [href])

    useEffect(() => {
        if (!href) return
        const cached = previewCache.get(href)
        if (!cached) return
        if (Date.now() - cached.timestamp > PREVIEW_CACHE_TTL) {
            previewCache.delete(href)
            return
        }
        if (cached.status === 'error') {
            setHasError(true)
        }
    }, [href])

    useEffect(() => {
        if (open || isVisible) {
            setShouldLoad(true)
        }
    }, [open, isVisible])

    const handleImageLoad = useCallback(() => {
        if (!href) return
        previewCache.set(href, { status: 'ok', timestamp: Date.now() })
    }, [href])

    const handleImageError = useCallback(() => {
        if (href) {
            previewCache.set(href, { status: 'error', timestamp: Date.now() })
        }
        setHasError(true)
    }, [href])

    const linkClass = 'text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-1'
    const linkClassLong = linkClass + ' break-all'

    const anchorContent = useShort ? (
        <span className="inline-flex items-center gap-1">
            <IconExternalLink size={12} className="shrink-0 opacity-75" />
            {display}
        </span>
    ) : (
        display
    )

    if (!isExternalLink(href)) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={useShort ? linkClass : linkClassLong}
                title={href}
                {...props}
            >
                {anchorContent}
            </a>
        )
    }

    return (
        <HoverCard.Root openDelay={60} closeDelay={120} onOpenChange={setOpen}>
            <HoverCard.Trigger asChild>
                <a
                    ref={triggerRef}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={useShort ? linkClass : linkClassLong}
                    title={href}
                    {...props}
                >
                    {anchorContent}
                </a>
            </HoverCard.Trigger>
            <HoverCard.Portal>
                <HoverCard.Content
                    side="top"
                    align="center"
                    sideOffset={8}
                    className="z-50 rounded-xl border border-border bg-background/95 p-2 shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95"
                >
                    <div className="rounded-lg overflow-hidden bg-muted/40">
                        {hasError ? (
                            <div
                                className="flex items-center justify-center text-xs text-muted-foreground"
                                style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
                            >
                                Preview unavailable
                            </div>
                        ) : shouldLoad ? (
                            <img
                                src={previewUrl}
                                width={PREVIEW_WIDTH}
                                height={PREVIEW_HEIGHT}
                                loading="eager"
                                decoding="async"
                                alt={`Preview of ${getDomain(href || '')}`}
                                className="block object-cover"
                                onLoad={handleImageLoad}
                                onError={handleImageError}
                            />
                        ) : (
                            <div
                                className="animate-pulse bg-muted"
                                style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
                            />
                        )}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground truncate max-w-[240px]">
                        {getDomain(href || '')}
                    </div>
                </HoverCard.Content>
            </HoverCard.Portal>
        </HoverCard.Root>
    )
}

// ============================================================================
// Size Configurations
// ============================================================================

type MarkdownSize = 'sm' | 'md' | 'lg'

const sizeStyles: Record<MarkdownSize, {
    prose: string
    h1: string
    h2: string
    h3: string
    p: string
    ul: string
    ol: string
    li: string
    inlineCode: string
    blockquote: string
}> = {
    sm: {
        prose: 'prose-sm',
        h1: 'text-base font-semibold mt-4 mb-2 first:mt-0 text-foreground',
        h2: 'text-base font-semibold mt-4 mb-2 first:mt-0 text-foreground',
        h3: 'text-sm font-semibold mt-3 mb-1.5 first:mt-0 text-foreground',
        p: 'text-sm text-foreground/85 my-2 leading-relaxed',
        ul: 'list-disc pl-6 text-sm text-foreground/85 my-2 space-y-1',
        ol: 'list-decimal pl-6 text-sm text-foreground/85 my-2 space-y-1',
        li: 'text-sm text-foreground/85 leading-relaxed',
        inlineCode: 'bg-muted/80 text-foreground font-mono text-[0.85em] rounded px-1.5 py-0.5 border border-border/30',
        blockquote: 'border-l-3 border-primary/40 pl-4 py-1 text-foreground/70 my-3 text-sm italic bg-muted/20 rounded-r-lg',
    },
    md: {
        prose: 'prose-base',
        h1: 'text-xl font-semibold mt-6 mb-3 first:mt-0 text-foreground',
        h2: 'text-lg font-semibold mt-5 mb-2 first:mt-0 text-foreground',
        h3: 'text-base font-semibold mt-4 mb-2 first:mt-0 text-foreground',
        p: 'text-sm text-foreground/85 my-2.5 leading-relaxed',
        ul: 'list-disc pl-6 text-sm text-foreground/85 my-2.5 space-y-1.5',
        ol: 'list-decimal pl-6 text-sm text-foreground/85 my-2.5 space-y-1.5',
        li: 'text-sm text-foreground/85 leading-relaxed',
        inlineCode: 'bg-muted/80 text-foreground font-mono text-[0.85em] rounded px-1.5 py-0.5 border border-border/30',
        blockquote: 'border-l-3 border-primary/40 pl-4 py-2 text-foreground/70 my-4 italic bg-muted/20 rounded-r-lg',
    },
    lg: {
        prose: 'prose-lg',
        h1: 'text-2xl font-semibold mt-8 mb-4 first:mt-0 text-foreground',
        h2: 'text-xl font-semibold mt-6 mb-3 first:mt-0 text-foreground',
        h3: 'text-lg font-semibold mt-5 mb-2 first:mt-0 text-foreground',
        p: 'text-base text-foreground/85 my-3 leading-relaxed',
        ul: 'list-disc pl-6 text-base text-foreground/85 my-3 space-y-2',
        ol: 'list-decimal pl-6 text-base text-foreground/85 my-3 space-y-2',
        li: 'text-base text-foreground/85 leading-relaxed',
        inlineCode: 'bg-muted/80 text-foreground font-mono text-[0.85em] rounded px-1.5 py-0.5 border border-border/30',
        blockquote: 'border-l-3 border-primary/40 pl-4 py-2 text-foreground/70 my-5 italic bg-muted/20 rounded-r-lg',
    },
}

// ============================================================================
// Citation Processing Utilities
// ============================================================================

/**
 * Clean OpenAI file citation markers from text
 * These appear as 【source】 or 【6:20†filename】 style markers
 */
function cleanOpenAICitationMarkers(text: string): string {
    // Pattern matches 【...】 brackets with various content inside
    // Common formats: 【source】, 【6:20†archivo.pdf】, 【turn4file】
    return text
        .replace(/【[^】]*】/g, '') // Remove 【...】 markers
        .replace(/\[\[cite:[^\]]+\]\]/g, '') // Remove our [[cite:...]] markers if AI outputs them
        .replace(/Dfilecite[□\s]*turn\d*file/gi, '') // Clean corrupted markers
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
        .trim()
}

/**
 * Check if text contains citation patterns
 * Supports: [1], [2], [turn2file0], [turn2file1], etc.
 */
function containsCitationPattern(text: string): boolean {
    return /\[\d+\]/.test(text) || /\[turn\d*file\d+\]/i.test(text)
}

/**
 * Process text to replace citation patterns with InlineCitation components
 * Supports: [N] and [turnXfileN] formats
 * Returns an array of strings and React elements
 */
function processTextWithCitations(
    text: string,
    citations: CitationData[],
    onNavigate?: (citation: CitationData) => void
): (string | React.ReactElement)[] {
    if (!citations || citations.length === 0) return [text]

    const citationMap = new Map(citations.map(c => [c.id, c]))
    const parts: (string | React.ReactElement)[] = []
    let lastIndex = 0

    // Combined pattern for both [N] and [turnXfileN] formats
    // turnXfileN uses 0-indexed, so we add 1 to get the citation ID
    const pattern = /\[(\d+)\]|\[turn\d*file(\d+)\]/gi
    let match: RegExpExecArray | null

    // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
    while ((match = pattern.exec(text)) !== null) {
        // match[1] is for [N] format, match[2] is for [turnXfileN] format
        let citationId: number
        if (match[1] !== undefined) {
            citationId = parseInt(match[1], 10)
        } else if (match[2] !== undefined) {
            // turnXfileN is 0-indexed, convert to 1-indexed
            citationId = parseInt(match[2], 10) + 1
        } else {
            continue
        }

        const citation = citationMap.get(citationId)

        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index))
        }

        // Add citation component or remove if no matching citation
        if (citation) {
            parts.push(
                <InlineCitation
                    key={`cite-${match.index}-${citationId}`}
                    citation={citation}
                    onNavigate={onNavigate}
                />
            )
        }
        // If no matching citation, don't add anything (removes the raw marker)

        lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
}

/**
 * Wrapper component to render text with inline citations
 * Also cleans up OpenAI's file citation markers
 */
const TextWithCitations = memo(function TextWithCitations({
    children,
    citations,
    onNavigate
}: {
    children: ReactNode
    citations: CitationData[]
    onNavigate?: (citation: CitationData) => void
}) {
    const rawText = getText(children)

    // Always clean OpenAI citation markers from the text
    const cleanedText = cleanOpenAICitationMarkers(rawText)
    const wasChanged = cleanedText !== rawText

    // If we have citations with patterns, process them
    if (citations && citations.length > 0 && containsCitationPattern(cleanedText)) {
        const parts = processTextWithCitations(cleanedText, citations, onNavigate)
        return (
            <>
                {parts.map((part, i) => (
                    typeof part === 'string' ? <Fragment key={i}>{part}</Fragment> : part
                ))}
            </>
        )
    }

    // If text was modified (cleaned), return the cleaned version
    if (wasChanged) {
        return <>{cleanedText}</>
    }

    // No changes needed, return original children to preserve any React elements
    return <>{children}</>
})

// ============================================================================
// Main Markdown Renderer Component
// ============================================================================

interface ChatMarkdownRendererProps {
    content: string
    size?: MarkdownSize
    className?: string
    /** Whether the content is still streaming (enables Streamdown optimizations) */
    isAnimating?: boolean
    /** Document citations for inline [N] references */
    documentCitations?: CitationData[]
}

/**
 * Sanitize markdown content to fix common AI model issues:
 * - Remove empty bullet points (- with no content)
 * - Remove bullets with only whitespace
 * - Fix bullets that only have invisible chars
 */
function sanitizeMarkdown(content: string): string {
    return content
        // Remove lines that are just "- " or "* " with nothing meaningful after
        .replace(/^[\t ]*[-*+][\t ]*$/gm, '')
        // Remove lines that are just "- " followed by only whitespace/invisible chars
        .replace(/^[\t ]*[-*+][\t ]+[\s\u200B\u200C\u200D\uFEFF]*$/gm, '')
        // Remove numbered list items that are empty (e.g., "1. " with nothing)
        .replace(/^[\t ]*\d+\.[\t ]*$/gm, '')
        .replace(/^[\t ]*\d+\.[\t ]+[\s\u200B\u200C\u200D\uFEFF]*$/gm, '')
        // Collapse multiple empty lines into max 2
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
    content,
    size = 'md',
    className,
    isAnimating = false,
    documentCitations = [],
}: ChatMarkdownRendererProps) {
    const styles = sizeStyles[size]

    // Sanitize content to fix AI model issues (empty bullets, etc.)
    const sanitizedContent = useMemo(() => sanitizeMarkdown(content), [content])

    // Citation navigation hook - opens PDF tab when citation is clicked
    const { navigateToCitation } = useCitationNavigation()

    // Memoize plugins object to prevent re-initialization
    // singleDollarTextMath: true so $...$ works for inline LaTeX (e.g. $e^{i\pi}+1=0$)
    const plugins = useMemo(
        () => ({ code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid }),
        []
    )

    // Create text wrapper that handles citations and cleans OpenAI markers
    // Always wrap to clean potential OpenAI markers even without citations
    const wrapWithCitations = useCallback((children: ReactNode) => {
        return <TextWithCitations citations={documentCitations} onNavigate={navigateToCitation}>{children}</TextWithCitations>
    }, [documentCitations, navigateToCitation])

    return (
        <div className={cn('max-w-none break-words', className)}>
            <Streamdown
                plugins={plugins}
                isAnimating={isAnimating}
                caret={isAnimating ? 'block' : undefined}
                components={{
                    // Headings
                    h1: ({ children, ...props }: any) => (
                        <h1 className={styles.h1} {...props}>{wrapWithCitations(children)}</h1>
                    ),
                    h2: ({ children, ...props }: any) => (
                        <h2 className={styles.h2} {...props}>{wrapWithCitations(children)}</h2>
                    ),
                    h3: ({ children, ...props }: any) => (
                        <h3 className={styles.h3} {...props}>{wrapWithCitations(children)}</h3>
                    ),
                    h4: ({ children, ...props }: any) => (
                        <h4 className={styles.h3} {...props}>{wrapWithCitations(children)}</h4>
                    ),
                    h5: ({ children, ...props }: any) => (
                        <h5 className={styles.h3} {...props}>{wrapWithCitations(children)}</h5>
                    ),
                    h6: ({ children, ...props }: any) => (
                        <h6 className={styles.h3} {...props}>{wrapWithCitations(children)}</h6>
                    ),

                    // Paragraphs - main place where citations appear
                    p: ({ children, ...props }: any) => (
                        <p className={styles.p} {...props}>{wrapWithCitations(children)}</p>
                    ),

                    // Lists
                    ul: ({ children, ...props }: any) => (
                        <ul className={styles.ul} {...props}>{children}</ul>
                    ),
                    ol: ({ children, ...props }: any) => (
                        <ol className={styles.ol} {...props}>{children}</ol>
                    ),
                    li: ({ children, ...props }: any) => (
                        <li className={styles.li} {...props}>{wrapWithCitations(children)}</li>
                    ),

                    // Links
                    a: ({ href, children, ...props }: any) => (
                        <LinkWithPreview href={href} {...props}>
                            {children}
                        </LinkWithPreview>
                    ),

                    // Text formatting - wrap with citations
                    strong: ({ children, ...props }: any) => (
                        <strong className="font-semibold text-foreground" {...props}>{wrapWithCitations(children)}</strong>
                    ),
                    em: ({ children, ...props }: any) => (
                        <em className="italic" {...props}>{wrapWithCitations(children)}</em>
                    ),
                    del: ({ children, ...props }: any) => (
                        <del className="line-through text-muted-foreground" {...props}>{wrapWithCitations(children)}</del>
                    ),

                    // Blockquotes
                    blockquote: ({ children, ...props }: any) => (
                        <blockquote className={styles.blockquote} {...props}>{children}</blockquote>
                    ),

                    // Horizontal rule
                    hr: () => <hr className="my-6 border-border/50" />,

                    // Tables - Streamdown handles these with plugins
                    table: ({ children, ...props }: any) => (
                        <div className="overflow-x-auto my-4 rounded-xl border border-border/40 shadow-sm">
                            <table className="w-full text-sm" {...props}>{children}</table>
                        </div>
                    ),
                    thead: ({ children, ...props }: any) => (
                        <thead className="bg-muted/50 border-b border-border/40" {...props}>{children}</thead>
                    ),
                    tbody: ({ children, ...props }: any) => (
                        <tbody className="divide-y divide-border/30" {...props}>{children}</tbody>
                    ),
                    tr: ({ children, ...props }: any) => (
                        <tr className="hover:bg-muted/30 transition-colors" {...props}>{children}</tr>
                    ),
                    th: ({ children, ...props }: any) => (
                        <th className="text-left font-medium px-4 py-2.5 text-foreground" {...props}>{wrapWithCitations(children)}</th>
                    ),
                    td: ({ children, ...props }: any) => (
                        <td className="px-4 py-2.5 text-foreground/80" {...props}>{wrapWithCitations(children)}</td>
                    ),

                    // Code blocks - Use our custom CodeBlock wrapper
                    pre: ({ children }: any) => <CodeBlock>{children}</CodeBlock>,

                    // Inline code - styled pill; if it looks like LaTeX (e.g. model used backticks), render with KaTeX
                    code: ({ children, className: codeClassName, ...props }: any) => {
                        const isBlockCode = codeClassName?.includes('language-')
                        if (isBlockCode) {
                            return (
                                <code
                                    className={cn(codeClassName, "text-[13px] font-mono leading-relaxed whitespace-pre")}
                                    {...props}
                                >
                                    {children}
                                </code>
                            )
                        }
                        const raw = getText(children)
                        const latexHtml = tryRenderLatex(raw)
                        if (latexHtml) {
                            return <span className="katex" dangerouslySetInnerHTML={{ __html: latexHtml }} />
                        }
                        return (
                            <code className={styles.inlineCode} {...props}>
                                {children}
                            </code>
                        )
                    },

                    // Images
                    img: ({ src, alt, ...props }: any) => (
                        <img
                            src={src}
                            alt={alt}
                            className="max-w-full h-auto rounded-lg my-4 border border-border/30"
                            loading="lazy"
                            {...props}
                        />
                    ),
                }}
            >
                {sanitizedContent}
            </Streamdown>
        </div>
    )
})

// ============================================================================
// Compact Version for Smaller Contexts
// ============================================================================

export const CompactMarkdownRenderer = memo(function CompactMarkdownRenderer({
    content,
    className,
    documentCitations,
}: {
    content: string
    className?: string
    documentCitations?: CitationData[]
}) {
    return <ChatMarkdownRenderer content={content} size="sm" className={className} documentCitations={documentCitations} />
})

// Re-export citation type for consumers
export type { CitationData }
