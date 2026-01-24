import type { AIProvider } from '@s-agi/core/types/ai'

interface ModelIconProps {
    provider: AIProvider
    className?: string
    size?: number
}

/**
 * OpenAI logo SVG
 */
export function OpenAIIcon({ className, size = 16 }: { className?: string; size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
            className={className}
            role="img"
            aria-labelledby="openai-title"
        >
            <title id="openai-title">OpenAI</title>
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
    )
}

/**
 * Anthropic logo SVG
 */
export function AnthropicIcon({ className, size = 16 }: { className?: string; size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
            className={className}
            role="img"
            aria-labelledby="anthropic-title"
        >
            <title id="anthropic-title">Anthropic</title>
            <path d="M17.304 3.541h-3.672l6.696 16.918h3.672l-6.696-16.918Zm-10.608 0L0 20.459h3.744l1.368-3.553h6.912l1.368 3.553h3.744L10.44 3.541H6.696Zm-.456 10.37 2.376-6.167 2.376 6.167H6.24Z" />
        </svg>
    )
}

/**
 * ChatGPT Plus icon (OpenAI with sparkles/plus indicator)
 */
export function ChatGPTPlusIcon({ className, size = 16 }: { className?: string; size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
            className={className}
            role="img"
            aria-labelledby="chatgpt-plus-title"
        >
            <title id="chatgpt-plus-title">ChatGPT Plus</title>
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
    )
}

/**
 * Z.AI icon
 */
export function ZaiIcon({ className, size = 16 }: { className?: string; size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
            className={className}
            role="img"
            aria-labelledby="zai-title"
        >
            <title id="zai-title">Z.AI</title>
            <path
                fillRule="evenodd"
                d="M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z"
            />
        </svg>
    )
}

/**
 * Generic AI model icon that renders based on provider
 */
export function ModelIcon({ provider, className, size = 16 }: ModelIconProps) {
    switch (provider) {
        case 'openai':
            return <OpenAIIcon className={className} size={size} />
        case 'chatgpt-plus':
            return <ChatGPTPlusIcon className={className} size={size} />
        case 'zai':
            return <ZaiIcon className={className} size={size} />
        default:
            return <OpenAIIcon className={className} size={size} />
    }
}

/**
 * Model icon with provider name
 */
export function ModelIconWithLabel({
    provider,
    modelName,
    className,
    iconSize = 14
}: {
    provider: AIProvider
    modelName: string
    className?: string
    iconSize?: number
}) {
    return (
        <div className={`flex items-center gap-1.5 ${className || ''}`}>
            <ModelIcon provider={provider} size={iconSize} />
            <span className="text-sm">{modelName}</span>
        </div>
    )
}
