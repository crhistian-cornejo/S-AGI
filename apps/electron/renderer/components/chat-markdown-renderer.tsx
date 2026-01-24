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
import { useCitationNavigation } from '@/hooks'

import 'katex/dist/katex.min.css'

// ============================================================================
// LaTeX Detection and Rendering
// ============================================================================

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
// Code Block Component
// ============================================================================

function CodeBlock({ children }: { children: React.ReactNode }) {
    const preRef = useRef<HTMLPreElement>(null)
    const [codeText, setCodeText] = useState('')
    const [language, setLanguage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (preRef.current) {
            const codeElement = preRef.current.querySelector('code')
            if (codeElement) {
                setCodeText((codeElement.textContent || '').trim())
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
        <div className="not-prose my-4 rounded-xl overflow-hidden border border-border/50 bg-zinc-950 shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/80 border-b border-border/30">
                <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    {language || 'code'}
                </span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
                    title={copied ? 'Copied!' : 'Copy code'}
                    disabled={!codeText}
                >
                    {copied ? (
                        <IconCheck size={14} className="text-emerald-400" />
                    ) : (
                        <IconCopy size={14} />
                    )}
                </button>
            </div>
            {/* Code */}
            <pre
                ref={preRef}
                className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
            >
                {children}
            </pre>
        </div>
    )
}

// ============================================================================
// Link Preview Component
// ============================================================================

const PREVIEW_WIDTH = 280
const PREVIEW_HEIGHT = 160
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
        if (open || isVisible) setShouldLoad(true)
    }, [open, isVisible])

    const handleImageLoad = useCallback(() => {
        if (href) previewCache.set(href, { status: 'ok', timestamp: Date.now() })
    }, [href])

    const handleImageError = useCallback(() => {
        if (href) previewCache.set(href, { status: 'error', timestamp: Date.now() })
        setHasError(true)
    }, [href])

    const anchorContent = useShort ? (
        <span className="inline-flex items-center gap-1">
            <IconExternalLink size={12} className="shrink-0 opacity-60" />
            {display}
        </span>
    ) : display

    if (!isExternalLink(href)) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium no-underline hover:underline underline-offset-2 break-words"
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
                    className="text-primary font-medium no-underline hover:underline underline-offset-2 break-words"
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
                    className="z-50 rounded-xl border border-border bg-popover p-2 shadow-xl animate-popover-in"
                >
                    <div className="rounded-lg overflow-hidden bg-muted/30">
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
                    <div className="mt-2 px-1 text-[11px] text-muted-foreground truncate">
                        {getDomain(href || '')}
                    </div>
                </HoverCard.Content>
            </HoverCard.Portal>
        </HoverCard.Root>
    )
}

// ============================================================================
// Citation Processing
// ============================================================================

function cleanOpenAICitationMarkers(text: string): string {
    return text
        .replace(/【[^】]*】/g, '')
        .replace(/\[\[cite:[^\]]+\]\]/g, '')
        .replace(/Dfilecite[□\s]*turn\d*file/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

function containsCitationPattern(text: string): boolean {
    return /\[\d+\]/.test(text) || /\[turn\d*file\d+\]/i.test(text)
}

function processTextWithCitations(
    text: string,
    citations: CitationData[],
    onNavigate?: (citation: CitationData) => void
): (string | React.ReactElement)[] {
    if (!citations || citations.length === 0) return [text]

    const citationMap = new Map(citations.map(c => [c.id, c]))
    const parts: (string | React.ReactElement)[] = []
    let lastIndex = 0
    const pattern = /\[(\d+)\]|\[turn\d*file(\d+)\]/gi
    let match: RegExpExecArray | null

    // biome-ignore lint/suspicious/noAssignInExpressions: needed for regex exec loop
    while ((match = pattern.exec(text)) !== null) {
        let citationId: number
        if (match[1] !== undefined) {
            citationId = parseInt(match[1], 10)
        } else if (match[2] !== undefined) {
            citationId = parseInt(match[2], 10) + 1
        } else {
            continue
        }

        const citation = citationMap.get(citationId)
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index))
        }
        if (citation) {
            parts.push(
                <InlineCitation
                    key={`cite-${match.index}-${citationId}`}
                    citation={citation}
                    onNavigate={onNavigate}
                />
            )
        }
        lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
}

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
    const cleanedText = cleanOpenAICitationMarkers(rawText)
    const wasChanged = cleanedText !== rawText

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

    if (wasChanged) return <>{cleanedText}</>
    return <>{children}</>
})

// ============================================================================
// Main Markdown Renderer
// ============================================================================

interface ChatMarkdownRendererProps {
    content: string
    size?: 'sm' | 'md' | 'lg'
    className?: string
    isAnimating?: boolean
    documentCitations?: CitationData[]
}

function sanitizeMarkdown(content: string): string {
    return content
        .replace(/^[\t ]*[-*+][\t ]*$/gm, '')
        .replace(/^[\t ]*[-*+][\t ]+[\s\u200B\u200C\u200D\uFEFF]*$/gm, '')
        .replace(/^[\t ]*\d+\.[\t ]*$/gm, '')
        .replace(/^[\t ]*\d+\.[\t ]+[\s\u200B\u200C\u200D\uFEFF]*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// Tailwind Typography prose size classes
const proseSizeClasses = {
    sm: 'prose-sm',
    md: 'prose-base',
    lg: 'prose-lg',
}

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
    content,
    size = 'md',
    className,
    isAnimating = false,
    documentCitations = [],
}: ChatMarkdownRendererProps) {
    const sanitizedContent = useMemo(() => sanitizeMarkdown(content), [content])
    const { navigateToCitation } = useCitationNavigation()

    const plugins = useMemo(
        () => ({ code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid }),
        []
    )

    const wrapWithCitations = useCallback((children: ReactNode) => {
        return <TextWithCitations citations={documentCitations} onNavigate={navigateToCitation}>{children}</TextWithCitations>
    }, [documentCitations, navigateToCitation])

    return (
        <div
            className={cn(
                // Base prose with Typography plugin
                'prose prose-neutral dark:prose-invert',
                proseSizeClasses[size],
                // Width and overflow control
                'w-full max-w-none overflow-hidden',
                // Custom prose styling overrides
                // Headings
                'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
                'prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-4',
                'prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-3',
                'prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2',
                // Paragraphs
                'prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:my-3',
                // Links handled by custom component
                'prose-a:no-underline',
                // Lists
                'prose-ul:my-3 prose-ul:pl-5',
                'prose-ol:my-3 prose-ol:pl-5',
                'prose-li:text-foreground/90 prose-li:my-1 prose-li:marker:text-muted-foreground',
                // Strong/Bold
                'prose-strong:font-semibold prose-strong:text-foreground',
                // Blockquotes
                'prose-blockquote:border-l-2 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:py-1',
                'prose-blockquote:text-foreground/80 prose-blockquote:not-italic prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg',
                // Inline code
                'prose-code:before:content-none prose-code:after:content-none',
                'prose-code:bg-muted prose-code:text-foreground prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[0.875em] prose-code:font-normal',
                // HR
                'prose-hr:border-border/50 prose-hr:my-6',
                // Images
                'prose-img:rounded-xl prose-img:border prose-img:border-border/30',
                className
            )}
        >
            <Streamdown
                plugins={plugins}
                isAnimating={isAnimating}
                caret={isAnimating ? 'block' : undefined}
                components={{
                    // Headings with citation support
                    h1: ({ children, ...props }: any) => (
                        <h1 {...props}>{wrapWithCitations(children)}</h1>
                    ),
                    h2: ({ children, ...props }: any) => (
                        <h2 {...props}>{wrapWithCitations(children)}</h2>
                    ),
                    h3: ({ children, ...props }: any) => (
                        <h3 {...props}>{wrapWithCitations(children)}</h3>
                    ),
                    h4: ({ children, ...props }: any) => (
                        <h4 {...props}>{wrapWithCitations(children)}</h4>
                    ),
                    h5: ({ children, ...props }: any) => (
                        <h5 {...props}>{wrapWithCitations(children)}</h5>
                    ),
                    h6: ({ children, ...props }: any) => (
                        <h6 {...props}>{wrapWithCitations(children)}</h6>
                    ),

                    // Paragraphs
                    p: ({ children, ...props }: any) => (
                        <p {...props}>{wrapWithCitations(children)}</p>
                    ),

                    // Lists
                    ul: ({ children, ...props }: any) => <ul {...props}>{children}</ul>,
                    ol: ({ children, ...props }: any) => <ol {...props}>{children}</ol>,
                    li: ({ children, ...props }: any) => (
                        <li {...props}>{wrapWithCitations(children)}</li>
                    ),

                    // Links with preview
                    a: ({ href, children, ...props }: any) => (
                        <LinkWithPreview href={href} {...props}>
                            {children}
                        </LinkWithPreview>
                    ),

                    // Text formatting
                    strong: ({ children, ...props }: any) => (
                        <strong {...props}>{wrapWithCitations(children)}</strong>
                    ),
                    em: ({ children, ...props }: any) => (
                        <em {...props}>{wrapWithCitations(children)}</em>
                    ),
                    del: ({ children, ...props }: any) => (
                        <del className="text-muted-foreground" {...props}>{wrapWithCitations(children)}</del>
                    ),

                    // Blockquotes
                    blockquote: ({ children, ...props }: any) => (
                        <blockquote {...props}>{children}</blockquote>
                    ),

                    // HR
                    hr: () => <hr />,

                    // Tables - Premium styling
                    table: ({ children, ...props }: any) => (
                        <div className="not-prose my-4 overflow-x-auto rounded-xl border border-border/50 shadow-sm">
                            <table className="w-full text-sm" {...props}>{children}</table>
                        </div>
                    ),
                    thead: ({ children, ...props }: any) => (
                        <thead className="bg-muted/50 border-b border-border/50" {...props}>{children}</thead>
                    ),
                    tbody: ({ children, ...props }: any) => (
                        <tbody className="divide-y divide-border/30" {...props}>{children}</tbody>
                    ),
                    tr: ({ children, ...props }: any) => (
                        <tr className="hover:bg-muted/20 transition-colors" {...props}>{children}</tr>
                    ),
                    th: ({ children, ...props }: any) => (
                        <th className="text-left font-medium px-4 py-3 text-foreground text-xs uppercase tracking-wider" {...props}>
                            {wrapWithCitations(children)}
                        </th>
                    ),
                    td: ({ children, ...props }: any) => (
                        <td className="px-4 py-3 text-foreground/80" {...props}>
                            {wrapWithCitations(children)}
                        </td>
                    ),

                    // Code blocks
                    pre: ({ children }: any) => <CodeBlock>{children}</CodeBlock>,

                    // Inline code with LaTeX detection
                    code: ({ children, className: codeClassName, ...props }: any) => {
                        const isBlockCode = codeClassName?.includes('language-')
                        if (isBlockCode) {
                            return (
                                <code className={cn(codeClassName, 'text-[13px] font-mono leading-relaxed')} {...props}>
                                    {children}
                                </code>
                            )
                        }
                        const raw = getText(children)
                        const latexHtml = tryRenderLatex(raw)
                        if (latexHtml) {
                            return <span dangerouslySetInnerHTML={{ __html: latexHtml }} />
                        }
                        return <code {...props}>{children}</code>
                    },

                    // Images
                    img: ({ src, alt, ...props }: any) => (
                        <img
                            src={src}
                            alt={alt}
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

// Compact version
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

export type { CitationData }
