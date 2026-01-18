import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { Streamdown } from 'streamdown'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

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
    }, [children])
    
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

function getDomain(url: string) {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return url
    }
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

    if (!isExternalLink(href)) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                {...props}
            >
                {children}
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
                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                    {...props}
                >
                    {children}
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
// Main Markdown Renderer Component
// ============================================================================

interface ChatMarkdownRendererProps {
    content: string
    size?: MarkdownSize
    className?: string
    /** Whether the content is still streaming (enables Streamdown optimizations) */
    isAnimating?: boolean
}

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
    content,
    size = 'md',
    className,
    isAnimating = false,
}: ChatMarkdownRendererProps) {
    const styles = sizeStyles[size]

    return (
        <div className={cn('max-w-none', className)}>
            <Streamdown
                mode={isAnimating ? 'streaming' : 'static'}
                isAnimating={isAnimating}
                shikiTheme={['github-light', 'github-dark']}
                controls={{
                    code: true,
                    table: true,
                    mermaid: {
                        download: true,
                        copy: true,
                        fullscreen: true,
                    }
                }}
                caret={isAnimating ? 'block' : undefined}
                components={{
                    // Headings
                    h1: ({ children, ...props }) => (
                        <h1 className={styles.h1} {...props}>{children}</h1>
                    ),
                    h2: ({ children, ...props }) => (
                        <h2 className={styles.h2} {...props}>{children}</h2>
                    ),
                    h3: ({ children, ...props }) => (
                        <h3 className={styles.h3} {...props}>{children}</h3>
                    ),
                    h4: ({ children, ...props }) => (
                        <h4 className={styles.h3} {...props}>{children}</h4>
                    ),
                    h5: ({ children, ...props }) => (
                        <h5 className={styles.h3} {...props}>{children}</h5>
                    ),
                    h6: ({ children, ...props }) => (
                        <h6 className={styles.h3} {...props}>{children}</h6>
                    ),
                    
                    // Paragraphs
                    p: ({ children, ...props }) => (
                        <p className={styles.p} {...props}>{children}</p>
                    ),
                    
                    // Lists
                    ul: ({ children, ...props }) => (
                        <ul className={styles.ul} {...props}>{children}</ul>
                    ),
                    ol: ({ children, ...props }) => (
                        <ol className={styles.ol} {...props}>{children}</ol>
                    ),
                    li: ({ children, ...props }) => (
                        <li className={styles.li} {...props}>{children}</li>
                    ),
                    
                    // Links
                    a: ({ href, children, ...props }) => (
                        <LinkWithPreview href={href} {...props}>
                            {children}
                        </LinkWithPreview>
                    ),
                    
                    // Text formatting
                    strong: ({ children, ...props }) => (
                        <strong className="font-semibold text-foreground" {...props}>{children}</strong>
                    ),
                    em: ({ children, ...props }) => (
                        <em className="italic" {...props}>{children}</em>
                    ),
                    del: ({ children, ...props }) => (
                        <del className="line-through text-muted-foreground" {...props}>{children}</del>
                    ),
                    
                    // Blockquotes
                    blockquote: ({ children, ...props }) => (
                        <blockquote className={styles.blockquote} {...props}>{children}</blockquote>
                    ),
                    
                    // Horizontal rule
                    hr: () => <hr className="my-6 border-border/50" />,
                    
                    // Tables
                    table: ({ children, ...props }) => (
                        <div className="overflow-x-auto my-4 rounded-xl border border-border/40 shadow-sm">
                            <table className="w-full text-sm" {...props}>{children}</table>
                        </div>
                    ),
                    thead: ({ children, ...props }) => (
                        <thead className="bg-muted/50 border-b border-border/40" {...props}>{children}</thead>
                    ),
                    tbody: ({ children, ...props }) => (
                        <tbody className="divide-y divide-border/30" {...props}>{children}</tbody>
                    ),
                    tr: ({ children, ...props }) => (
                        <tr className="hover:bg-muted/30 transition-colors" {...props}>{children}</tr>
                    ),
                    th: ({ children, ...props }) => (
                        <th className="text-left font-medium px-4 py-2.5 text-foreground" {...props}>{children}</th>
                    ),
                    td: ({ children, ...props }) => (
                        <td className="px-4 py-2.5 text-foreground/80" {...props}>{children}</td>
                    ),
                    
                    // Code blocks - Let Streamdown handle highlighting, we wrap with CodeBlock
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    
                    // Inline code - Streamdown passes className with language-xxx for block code
                    code: ({ children, className, ...props }: any) => {
                        // Block code has language-xxx class, let it render naturally inside pre
                        const isBlockCode = className?.includes('language-')
                        
                        if (isBlockCode) {
                            // Block code - keep Shiki highlighting, pass through with className
                            return (
                                <code 
                                    className={cn(className, "text-[13px] font-mono leading-relaxed whitespace-pre")} 
                                    {...props}
                                >
                                    {children}
                                </code>
                            )
                        }
                        
                        // Inline code - styled pill
                        return (
                            <code className={styles.inlineCode} {...props}>
                                {children}
                            </code>
                        )
                    },
                    
                    // Images
                    img: ({ src, alt, ...props }) => (
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
                {content}
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
}: {
    content: string
    className?: string
}) {
    return <ChatMarkdownRenderer content={content} size="sm" className={className} />
})
