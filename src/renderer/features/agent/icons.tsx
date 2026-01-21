import React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { className?: string }

// Spinner icon with CSS animation
export function IconSpinner(props: IconProps & { color?: string; size?: "default" | "nano" }) {
  const { className, style, color, size = "default", ...rest } = props
  const strokeWidth = size === "nano" ? 4 : 3
  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        className={className}
        style={{
          animation: "spin 1s linear infinite",
          ...style,
        }}
        aria-hidden="true"
        {...rest}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color || "currentColor"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          opacity={0.2}
        />
        <path
          d="M12 2C6.48 2 2 6.48 2 12"
          stroke={color || "currentColor"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </>
  )
}

// Expand icon (chevron pointing down/right)
export function ExpandIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 6L8 10L12 6" />
    </svg>
  )
}

// Collapse icon (chevron pointing up)
export function CollapseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 10L8 6L12 10" />
    </svg>
  )
}

// External link icon
export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 8.5V12.5C12 13.0523 11.5523 13.5 11 13.5H3.5C2.94772 13.5 2.5 13.0523 2.5 12.5V5C2.5 4.44772 2.94772 4 3.5 4H7.5" />
      <path d="M10 2.5H13.5V6" />
      <path d="M6.5 9.5L13 3" />
    </svg>
  )
}

// Terminal icon
export function CustomTerminalIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M5 6L7 8L5 10" />
      <path d="M9 10H11" />
    </svg>
  )
}

// Globe icon for web fetch
export function GlobeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8H14" />
      <path d="M8 2C9.5 3.5 10 5.5 10 8C10 10.5 9.5 12.5 8 14" />
      <path d="M8 2C6.5 3.5 6 5.5 6 8C6 10.5 6.5 12.5 8 14" />
    </svg>
  )
}

// Search icon
export function SearchIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}

// Sparkles icon for task/agent
export function SparklesIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 2L9 5L12 6L9 7L8 10L7 7L4 6L7 5L8 2Z" />
      <path d="M12 9L12.5 10.5L14 11L12.5 11.5L12 13L11.5 11.5L10 11L11.5 10.5L12 9Z" />
      <path d="M4 10L4.5 11.5L6 12L4.5 12.5L4 14L3.5 12.5L2 12L3.5 11.5L4 10Z" />
    </svg>
  )
}

// Planning icon
export function PlanningIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5 5H11" />
      <path d="M5 8H11" />
      <path d="M5 11H8" />
    </svg>
  )
}

// Edit/File icon
export function IconEditFile(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.67 14.33H5.33C4.22 14.33 3.33 13.44 3.33 12.33V4C3.33 2.89 4.22 2 5.33 2H10.67C11.78 2 12.67 2.89 12.67 4V7.33"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.33 14V12.44L11.67 10.11C12.06 9.72 12.79 9.72 13.22 10.11C13.65 10.54 13.65 11.24 13.22 11.67L10.89 14H9.33Z"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        d="M6 4.67H10"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
      />
      <path
        d="M6 7.33H7.33"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Write file icon
export function WriteFileIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 2H4C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V7" />
      <path d="M10 2H13V5" />
      <path d="M6 9H10" />
      <path d="M6 11H8" />
    </svg>
  )
}

// Eye icon for reading
export function EyeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M1.5 8C2.5 5 5 3 8 3C11 3 13.5 5 14.5 8C13.5 11 11 13 8 13C5 13 2.5 11 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

// Brain icon for reasoning/thinking
export function BrainIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 14V10" />
      <path d="M5 10C3.34 10 2 8.66 2 7C2 5.34 3.34 4 5 4C5.55 2.84 6.68 2 8 2C9.32 2 10.45 2.84 11 4C12.66 4 14 5.34 14 7C14 8.66 12.66 10 11 10" />
      <path d="M5 7.5C5 7.5 6 8.5 8 8.5C10 8.5 11 7.5 11 7.5" />
      <circle cx="6" cy="6" r="0.5" fill="currentColor" />
      <circle cx="10" cy="6" r="0.5" fill="currentColor" />
    </svg>
  )
}

// Code icon for code interpreter
export function CodeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 4L2 8L5 12" />
      <path d="M11 4L14 8L11 12" />
      <path d="M9 3L7 13" />
    </svg>
  )
}

// File search icon
export function FileSearchIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 2H4C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V6" />
      <path d="M9 2V6H13" />
      <circle cx="8" cy="10" r="2" />
      <path d="M9.5 11.5L11 13" />
    </svg>
  )
}

// Table/Spreadsheet icon
export function TableIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M2 6H14" />
      <path d="M6 6V14" />
    </svg>
  )
}

// Image/Photo icon for AI image generation
export function ImageIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <circle cx="5.5" cy="5.5" r="1.5" />
      <path d="M14 10L11 7L4 14" />
    </svg>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="1" y="8" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="6" y="4" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.7" />
    </svg>
  )
}
