import type { AIProvider } from '@shared/ai-types'

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
 * Gemini icon
 */
export function GeminiIcon({ className, size = 16 }: { className?: string; size?: number }) {
    return (
        <svg 
            viewBox="0 0 296 298" 
            xmlns="http://www.w3.org/2000/svg" 
            width={size} 
            height={size} 
            fill="none"
            className={className}
            role="img"
            aria-labelledby="gemini-title"
        >
            <title id="gemini-title">Gemini</title>
            <mask id="gemini-a" width="296" height="298" x="0" y="0" maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
                <path fill="#3186FF" d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"/>
            </mask>
            <g mask="url(#gemini-a)">
                <g filter="url(#gemini-b)"><ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159"/></g>
                <g filter="url(#gemini-c)"><ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5"/></g>
                <g filter="url(#gemini-d)"><ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5"/></g>
                <g filter="url(#gemini-e)"><path fill="#FA4340" d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z"/></g>
                <g filter="url(#gemini-f)"><path fill="#FA4340" d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5Z"/></g>
                <g filter="url(#gemini-g)"><path fill="#14BB69" d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z"/></g>
                <g filter="url(#gemini-h)"><path fill="#14BB69" d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5Z"/></g>
            </g>
            <defs>
                <filter id="gemini-b" width="464" height="390" x="-69" y="-46" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="18"/>
                </filter>
                <filter id="gemini-c" width="265" height="273" x="-99" y="6" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
                <filter id="gemini-d" width="265" height="273" x="-113" y="12" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
                <filter id="gemini-e" width="299.5" height="329" x="-41.5" y="-130" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
                <filter id="gemini-f" width="299.5" height="329" x="-45" y="-153" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
                <filter id="gemini-g" width="299.5" height="329" x="-41" y="91" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
                <filter id="gemini-h" width="299.5" height="329" x="-39" y="132" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
                    <feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
                </filter>
            </defs>
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
        // NOTE: gemini-advanced disabled
        // case 'gemini-advanced':
        //     return <GeminiIcon className={className} size={size} />
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
