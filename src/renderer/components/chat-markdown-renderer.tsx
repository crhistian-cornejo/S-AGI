import { cn } from '@/lib/utils'
import { memo, useState, useCallback } from 'react'
import { Streamdown } from 'streamdown'
import { IconCopy, IconCheck } from '@tabler/icons-react'

/**
 * Code block with copy button
 */
function CodeBlock({
    language,
    children,
}: {
    language?: string
    children: string
}) {
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(children)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [children])

    return (
        <div className="relative mt-2 mb-4 rounded-lg bg-muted/50 overflow-hidden group">
            <button
                type="button"
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                title={copied ? 'Copied!' : 'Copy code'}
            >
                {copied ? (
                    <IconCheck size={14} className="text-green-500" />
                ) : (
                    <IconCopy size={14} className="text-muted-foreground" />
                )}
            </button>
            {language && (
                <div className="px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50">
                    {language}
                </div>
            )}
            <pre className="p-4 overflow-x-auto text-sm">
                <code className="font-mono">{children}</code>
            </pre>
        </div>
    )
}

type MarkdownSize = 'sm' | 'md' | 'lg'

interface ChatMarkdownRendererProps {
    content: string
    size?: MarkdownSize
    className?: string
    /** Whether the content is still streaming (enables Streamdown optimizations) */
    isAnimating?: boolean
}

const sizeStyles: Record<MarkdownSize, {
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
        h1: 'text-base font-semibold mt-4 mb-1 first:mt-0',
        h2: 'text-base font-semibold mt-4 mb-1 first:mt-0',
        h3: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
        p: 'text-sm text-foreground/80 my-1 leading-relaxed',
        ul: 'list-disc list-inside text-sm text-foreground/80 my-1 space-y-0.5',
        ol: 'list-decimal list-inside text-sm text-foreground/80 my-1 space-y-0.5',
        li: 'text-sm text-foreground/80',
        inlineCode: 'bg-muted font-mono text-[0.85em] rounded px-1.5 py-0.5',
        blockquote: 'border-l-2 border-primary/30 pl-3 text-foreground/70 my-2 text-sm italic',
    },
    md: {
        h1: 'text-xl font-semibold mt-6 mb-2 first:mt-0',
        h2: 'text-lg font-semibold mt-5 mb-2 first:mt-0',
        h3: 'text-base font-semibold mt-4 mb-1 first:mt-0',
        p: 'text-sm text-foreground/80 my-2 leading-relaxed',
        ul: 'list-disc list-inside text-sm text-foreground/80 my-2 space-y-1',
        ol: 'list-decimal list-inside text-sm text-foreground/80 my-2 space-y-1',
        li: 'text-sm text-foreground/80',
        inlineCode: 'bg-muted font-mono text-[0.85em] rounded px-1.5 py-0.5',
        blockquote: 'border-l-2 border-primary/30 pl-4 text-foreground/70 my-3 italic',
    },
    lg: {
        h1: 'text-2xl font-semibold mt-8 mb-3 first:mt-0',
        h2: 'text-xl font-semibold mt-6 mb-2 first:mt-0',
        h3: 'text-lg font-semibold mt-5 mb-2 first:mt-0',
        p: 'text-base text-foreground/80 my-3 leading-relaxed',
        ul: 'list-disc list-inside text-base text-foreground/80 my-3 space-y-1.5',
        ol: 'list-decimal list-inside text-base text-foreground/80 my-3 space-y-1.5',
        li: 'text-base text-foreground/80',
        inlineCode: 'bg-muted font-mono text-[0.85em] rounded px-1.5 py-0.5',
        blockquote: 'border-l-2 border-primary/30 pl-4 text-foreground/70 my-4 italic',
    },
}

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
    content,
    size = 'md',
    className,
    isAnimating = false,
}: ChatMarkdownRendererProps) {
    const styles = sizeStyles[size]

    return (
        <div className={cn('prose prose-sm max-w-none dark:prose-invert', className)}>
            <Streamdown
                isAnimating={isAnimating}
                components={{
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
                    p: ({ children, ...props }) => (
                        <p className={styles.p} {...props}>{children}</p>
                    ),
                    ul: ({ children, ...props }) => (
                        <ul className={styles.ul} {...props}>{children}</ul>
                    ),
                    ol: ({ children, ...props }) => (
                        <ol className={styles.ol} {...props}>{children}</ol>
                    ),
                    li: ({ children, ...props }) => (
                        <li className={styles.li} {...props}>{children}</li>
                    ),
                    a: ({ href, children, ...props }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            {...props}
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children, ...props }) => (
                        <strong className="font-semibold text-foreground" {...props}>{children}</strong>
                    ),
                    em: ({ children, ...props }) => (
                        <em className="italic" {...props}>{children}</em>
                    ),
                    blockquote: ({ children, ...props }) => (
                        <blockquote className={styles.blockquote} {...props}>{children}</blockquote>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                    table: ({ children, ...props }) => (
                        <div className="overflow-x-auto my-3 rounded-lg border border-border">
                            <table className="w-full text-sm" {...props}>{children}</table>
                        </div>
                    ),
                    thead: ({ children, ...props }) => (
                        <thead className="bg-muted/50 border-b border-border" {...props}>{children}</thead>
                    ),
                    th: ({ children, ...props }) => (
                        <th className="text-left font-medium px-3 py-2" {...props}>{children}</th>
                    ),
                    td: ({ children, ...props }) => (
                        <td className="px-3 py-2 border-t border-border" {...props}>{children}</td>
                    ),
                    pre: ({ children }) => <>{children}</>,
                    code: ({ inline, className: codeClassName, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(codeClassName || '')
                        const language = match ? match[1] : undefined
                        const codeContent = String(children)

                        const shouldBeInline = inline || (!language && codeContent.length < 80 && !codeContent.includes('\n'))

                        if (shouldBeInline) {
                            return <code className={styles.inlineCode} {...props}>{children}</code>
                        }

                        return (
                            <CodeBlock language={language}>
                                {codeContent.replace(/\n$/, '')}
                            </CodeBlock>
                        )
                    },
                }}
            >
                {content}
            </Streamdown>
        </div>
    )
})

export const CompactMarkdownRenderer = memo(function CompactMarkdownRenderer({
    content,
    className,
}: {
    content: string
    className?: string
}) {
    return <ChatMarkdownRenderer content={content} size="sm" className={className} />
})
