import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  Fragment,
  isValidElement,
} from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import katex from "katex";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
// Mermaid is optional - if lodash-es fails to install, mermaid won't be available
// We'll load it dynamically inside the component to handle gracefully
import {
  IconCopy,
  IconCheck,
  IconExternalLink,
  IconBrandJavascript,
  IconBrandTypescript,
  IconBrandReact,
  IconBrandPython,
  IconBrandGolang,
  IconBrandRust,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandDocker,
  IconBrandGraphql,
  IconBrandCpp,
  IconBrandCSharp,
  IconBrandKotlin,
  IconBrandSwift,
  IconBrandPhp,
  IconBraces,
  IconBrackets,
  IconCode,
  IconDatabase,
  IconFileDiff,
  IconMarkdown,
  IconMathFunction,
  IconTerminal2,
  IconLetterC,
  IconCoffee,
  IconDiamond,
  IconSettingsCode,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  InlineCitation,
  type CitationData,
} from "@/components/inline-citation";
import { useCitationNavigation } from "@/hooks";
import { highlightCode, type HighlightOptions } from "@/lib/shiki";
import {
  getLanguageLabel,
  inferLanguageFromCode,
  languageMatchesCode,
  normalizeLanguageId,
} from "@/lib/code-language";

import "katex/dist/katex.min.css";

// ============================================================================
// LaTeX Detection and Rendering
// ============================================================================

const LATEX_LIKE =
  /\\(int|frac|sqrt|sum|infty|pi|alpha|beta|gamma|theta|sigma|omega|partial|lim|log|ln|exp|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|det|min|max|sup|inf|gcd|lcm|binom|prod|coprod|bigcup|bigcap|cdot|times|pm|mp|leq|geq|neq|approx|equiv|sim|simeq|cong|propto|subset|supset|subseteq|supseteq|in|notin|exists|forall|nabla|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|mapsto|to)\\b|\\^\\{|_\\{|∞|√|∫|∑|∏|∂|∇|∈|∉|⊂|⊃|⊆|⊇|∀|∃|≤|≥|≠|≈|≡|→|←|⇒|⇐|↔/;

function getText(children: ReactNode): string {
  if (children == null) return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getText).join("");
  // Handle React elements by extracting text from their children
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    return getText(props.children);
  }
  return "";
}

function normalizeLatex(s: string): string {
  return s
    .replace(/√π/g, "\\sqrt{\\pi}")
    .replace(/√2/g, "\\sqrt{2}")
    .replace(/√\(([^)]+)\)/g, "\\sqrt{$1}")
    .replace(/√(\d+)/g, "\\sqrt{$1}")
    .replace(/√/g, "\\sqrt{}")
    .replace(/ί/g, "i")
    .replace(/π/g, "\\pi")
    .replace(/∞/g, "\\infty")
    .replace(/\^\(([^)]+)\)/g, "^{$1}")
    .replace(/^f_\{-/, "\\int_{-")
    .replace(/^f_\{/, "\\int_{");
}

function tryRenderLatex(text: string, isDisplayMode = false): string | null {
  if (!text || text.length > 2000) return null; // Increased limit for complex equations
  if (!LATEX_LIKE.test(text)) return null;
  const normalized = normalizeLatex(text);
  try {
    return katex.renderToString(normalized, {
      throwOnError: false,
      displayMode: isDisplayMode,
      output: "htmlAndMathml", // Better accessibility
      strict: false, // Allow minor LaTeX inconsistencies from AI
      trust: false, // Security: don't allow \url, \href, etc.
    });
  } catch {
    return null;
  }
}

// ============================================================================
// Code Block Component
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LanguageIconComponent = React.ComponentType<any>;

const LANGUAGE_ICONS: Record<string, LanguageIconComponent> = {
  javascript: IconBrandJavascript,
  typescript: IconBrandTypescript,
  tsx: IconBrandReact,
  jsx: IconBrandReact,
  python: IconBrandPython,
  go: IconBrandGolang,
  rust: IconBrandRust,
  html: IconBrandHtml5,
  css: IconBrandCss3,
  json: IconBraces,
  markdown: IconMarkdown,
  yaml: IconBrackets,
  sql: IconDatabase,
  diff: IconFileDiff,
  shellscript: IconTerminal2,
  latex: IconMathFunction,
  dockerfile: IconBrandDocker,
  toml: IconSettingsCode,
  xml: IconCode,
  graphql: IconBrandGraphql,
  c: IconLetterC,
  cpp: IconBrandCpp,
  csharp: IconBrandCSharp,
  java: IconCoffee,
  kotlin: IconBrandKotlin,
  swift: IconBrandSwift,
  php: IconBrandPhp,
  ruby: IconDiamond,
};

function getLanguageIcon(language?: string | null): LanguageIconComponent | null {
  const normalized = normalizeLanguageId(language);
  if (!normalized) return null;
  return LANGUAGE_ICONS[normalized] ?? null;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [codeText, setCodeText] = useState("");
  const [rawLanguage, setRawLanguage] = useState<string | null>(null);
  const [resolvedLanguage, setResolvedLanguage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect theme
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (preRef.current) {
      const codeElement = preRef.current.querySelector("code");
      if (codeElement) {
        const text = (codeElement.textContent || "").trim();
        setCodeText(text);
        const className = codeElement.className || "";
        const match = /(?:^|\s)language-([^\s]+)/.exec(className);
        const explicitLanguage = match ? match[1] : null;
        setRawLanguage(explicitLanguage);

        const normalizedExplicit = normalizeLanguageId(explicitLanguage);
        const inferredLanguage = inferLanguageFromCode(text);
        const explicitMatches = normalizedExplicit
          ? languageMatchesCode(text, normalizedExplicit)
          : false;
        const finalLanguage =
          normalizedExplicit && explicitMatches
            ? normalizedExplicit
            : inferredLanguage ?? normalizedExplicit;
        setResolvedLanguage(finalLanguage);

        // Apply syntax highlighting if language is detected
        if (finalLanguage && text) {
          // Count lines to determine if we should show line numbers
          const lineCount = text.split('\n').length;
          const options: HighlightOptions = {
            // Show line numbers for code blocks with 5+ lines
            lineNumbers: lineCount >= 5,
          };

          highlightCode(text, finalLanguage, isDark ? "dark" : "light", options)
            .then((highlighted) => {
              setHighlightedCode(highlighted);
            })
            .catch((error) => {
              console.error("Failed to highlight code:", error);
              setHighlightedCode(null);
            });
        } else {
          setHighlightedCode(null);
        }
      }
    }
  }, [children, isDark]);

  const handleCopy = useCallback(() => {
    if (!codeText) return;
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeText]);

  const displayLanguage = useMemo(() => {
    const languageForLabel = resolvedLanguage ?? rawLanguage;
    return getLanguageLabel(languageForLabel);
  }, [rawLanguage, resolvedLanguage]);

  const LanguageIcon = useMemo(
    () => getLanguageIcon(resolvedLanguage ?? rawLanguage),
    [rawLanguage, resolvedLanguage],
  );

  return (
    <div className="not-prose my-4 rounded-xl overflow-hidden border border-border/50 bg-muted/30 dark:bg-zinc-950 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 dark:bg-zinc-900/80 border-b border-border/30">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground dark:text-zinc-400 uppercase tracking-wider">
          {LanguageIcon ? (
            <LanguageIcon size={14} className="text-muted-foreground/80" />
          ) : null}
          {displayLanguage}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-muted dark:hover:bg-zinc-800 transition-colors text-muted-foreground dark:text-zinc-500 hover:text-foreground dark:hover:text-zinc-300"
          title={copied ? "Copied!" : "Copy code"}
          disabled={!codeText}
        >
          {copied ? (
            <IconCheck
              size={14}
              className="text-emerald-500 dark:text-emerald-400"
            />
          ) : (
            <IconCopy size={14} />
          )}
        </button>
      </div>
      {/* Code */}
      <pre
        ref={preRef}
        className={cn(
          "overflow-x-auto p-4 text-[13px] leading-relaxed font-mono",
          highlightedCode && "shiki",
        )}
      >
        {highlightedCode ? (
          <code
            className={cn(
              resolvedLanguage ? `language-${resolvedLanguage}` : "",
              "shiki",
            )}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        ) : (
          <code
            className={cn(
              resolvedLanguage ? `language-${resolvedLanguage}` : "",
              "text-foreground",
            )}
          >
            {children}
          </code>
        )}
      </pre>
    </div>
  );
}

// ============================================================================
// Table Block Component
// ============================================================================

function TableBlock({
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableText, setTableText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!tableRef.current) return;
    const rows = Array.from(tableRef.current.querySelectorAll("tr"));
    const content = rows
      .map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim())
          .join("\t"),
      )
      .join("\n");
    setTableText(content);
  }, [children]);

  const handleCopy = useCallback(() => {
    if (!tableText) return;
    navigator.clipboard.writeText(tableText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [tableText]);

  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-border/50 shadow-sm">
      <div className="flex items-center justify-end border-b border-border/40 bg-muted/40 px-2 py-1.5">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          title={copied ? "Copied!" : "Copy table"}
          disabled={!tableText}
        >
          {copied ? (
            <IconCheck size={14} className="text-emerald-500" />
          ) : (
            <IconCopy size={14} />
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm" {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Link Preview Component
// ============================================================================

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 160;
const PREVIEW_CACHE_TTL = 5 * 60 * 1000;
const previewCache = new Map<
  string,
  { status: "ok" | "error"; timestamp: number }
>();

function isExternalLink(href?: string) {
  return Boolean(
    href && (href.startsWith("http://") || href.startsWith("https://")),
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "…" : url;
  }
}

function shouldUseShortLabel(
  href: string | undefined,
  linkText: string,
): boolean {
  if (!href || !linkText || linkText.length < 15) return false;
  if (linkText === href) return true;
  if (/^https?:\/\//i.test(linkText)) return true;
  if (linkText.length > 45 && /[./]/.test(linkText)) return true;
  return false;
}

function getPreviewUrl(url: string) {
  const params = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    colorScheme: "dark",
    "viewport.isMobile": "true",
    "viewport.deviceScaleFactor": "1",
    "viewport.width": `${Math.round(PREVIEW_WIDTH * 2.5)}`,
    "viewport.height": `${Math.round(PREVIEW_HEIGHT * 2.5)}`,
  });
  return `https://api.microlink.io/?${params.toString()}`;
}

function useVisibility(ref: React.RefObject<HTMLElement | null>) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return isVisible;
}

function LinkWithPreview({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [open, setOpen] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [hasError, setHasError] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const isVisible = useVisibility(triggerRef);

  const linkText = getText(children);
  const useShort = isExternalLink(href) && shouldUseShortLabel(href, linkText);
  const display = useShort && href ? getDomain(href) : children;

  const previewUrl = useMemo(() => (href ? getPreviewUrl(href) : ""), [href]);

  useEffect(() => {
    if (!href) return;
    const cached = previewCache.get(href);
    if (!cached) return;
    if (Date.now() - cached.timestamp > PREVIEW_CACHE_TTL) {
      previewCache.delete(href);
      return;
    }
    if (cached.status === "error") {
      setHasError(true);
    }
  }, [href]);

  useEffect(() => {
    if (open || isVisible) setShouldLoad(true);
  }, [open, isVisible]);

  const handleImageLoad = useCallback(() => {
    if (href) previewCache.set(href, { status: "ok", timestamp: Date.now() });
  }, [href]);

  const handleImageError = useCallback(() => {
    if (href)
      previewCache.set(href, { status: "error", timestamp: Date.now() });
    setHasError(true);
  }, [href]);

  const anchorContent = useShort ? (
    <span className="inline-flex items-center gap-1">
      <IconExternalLink size={12} className="shrink-0 opacity-60" />
      {display}
    </span>
  ) : (
    display
  );

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
    );
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
                alt={`Preview of ${getDomain(href || "")}`}
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
            {getDomain(href || "")}
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

// ============================================================================
// Citation Processing
// ============================================================================

function cleanOpenAICitationMarkers(text: string): string {
  return text
    .replace(/【[^】]*】/g, "")
    .replace(/\[\[cite:[^\]]+\]\]/g, "")
    .replace(/Dfilecite[□\s]*turn\d*file/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function containsCitationPattern(text: string): boolean {
  return /\[\d+\]/.test(text) || /\[turn\d*file\d+\]/i.test(text);
}

function processTextWithCitations(
  text: string,
  citations: CitationData[],
  onNavigate?: (citation: CitationData) => void,
): (string | React.ReactElement)[] {
  if (!citations || citations.length === 0) return [text];

  const citationMap = new Map(citations.map((c) => [c.id, c]));
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  const pattern = /\[(\d+)\]|\[turn\d*file(\d+)\]/gi;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: needed for regex exec loop
  while ((match = pattern.exec(text)) !== null) {
    let citationId: number;
    if (match[1] !== undefined) {
      citationId = parseInt(match[1], 10);
    } else if (match[2] !== undefined) {
      citationId = parseInt(match[2], 10) + 1;
    } else {
      continue;
    }

    const citation = citationMap.get(citationId);
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (citation) {
      parts.push(
        <InlineCitation
          key={`cite-${match.index}-${citationId}`}
          citation={citation}
          onNavigate={onNavigate}
        />,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

const TextWithCitations = memo(function TextWithCitations({
  children,
  citations,
  onNavigate,
}: {
  children: ReactNode;
  citations: CitationData[];
  onNavigate?: (citation: CitationData) => void;
}) {
  const rawText = getText(children);
  const cleanedText = cleanOpenAICitationMarkers(rawText);
  const wasChanged = cleanedText !== rawText;

  if (
    citations &&
    citations.length > 0 &&
    containsCitationPattern(cleanedText)
  ) {
    const parts = processTextWithCitations(cleanedText, citations, onNavigate);
    return (
      <>
        {parts.map((part, i) =>
          typeof part === "string" ? <Fragment key={i}>{part}</Fragment> : part,
        )}
      </>
    );
  }

  if (wasChanged) return <>{cleanedText}</>;
  return <>{children}</>;
});

// ============================================================================
// Main Markdown Renderer
// ============================================================================

interface ChatMarkdownRendererProps {
  content: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  isAnimating?: boolean;
  documentCitations?: CitationData[];
}

/**
 * Preprocess LaTeX: wrap raw LaTeX blocks and inline math with delimiters
 * so the math plugin can recognize them
 */
function preprocessLatex(content: string): string {
  let result = content;

  // ========================================================================
  // STEP 0: Protect markdown emphasis patterns BEFORE any LaTeX processing
  // This prevents **bold** and *italic* from being corrupted by math detection
  // ========================================================================
  const emphasisPlaceholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  // Protect ALL markdown table rows FIRST (header, separator, and data rows)
  // Table rows start and end with | and have at least 2 columns (3+ pipe characters)
  // Must be protected before any other processing to preserve table structure intact
  result = result.replace(/^\s*\|.+\|\s*$/gm, (match) => {
    if ((match.match(/\|/g) || []).length >= 3) {
      const placeholder = `⟦ETR${placeholderIndex++}⟧`;
      emphasisPlaceholders.set(placeholder, match);
      return placeholder;
    }
    return match;
  });

  // Protect inline code (`backtick content`)
  // Prevents _underscores_ inside code like `web_search` from being treated as italic
  result = result.replace(/`([^`\n]+)`/g, (match) => {
    const placeholder = `⟦EIC${placeholderIndex++}⟧`;
    emphasisPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protect **bold** patterns (including multi-word)
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (match) => {
    const placeholder = `⟦EMB${placeholderIndex++}⟧`;
    emphasisPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protect *italic* patterns (but not ** which was already replaced)
  result = result.replace(/\*([^*\n]+)\*/g, (match) => {
    const placeholder = `⟦EMI${placeholderIndex++}⟧`;
    emphasisPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protect __bold__ patterns
  result = result.replace(/__([^_\n]+)__/g, (match) => {
    const placeholder = `⟦EUB${placeholderIndex++}⟧`;
    emphasisPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protect _italic_ patterns
  result = result.replace(/_([^_\n]+)_/g, (match) => {
    const placeholder = `⟦EUI${placeholderIndex++}⟧`;
    emphasisPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // ========================================================================
  // STEP 0.5: Fix malformed LaTeX patterns that AI models often produce
  // ========================================================================

  // Fix: Bold headers that run into previous text (add newline before **)
  // Pattern: text!**Header or text.**Header → text!\n\n**Header
  result = result.replace(/([.!?])(\*\*[A-Z])/g, '$1\n\n$2');

  // Fix: $ $ or $  $ (empty or whitespace-only math) → remove
  result = result.replace(/\$\s*\$/g, '');

  // Fix: $$$ or more consecutive dollars → normalize to $$
  result = result.replace(/\${3,}/g, '$$');

  // Fix: $content$\,more$ or $content$\,more.$ → $content \, more$
  // AI often splits integral expressions like: $\int f(x)$\,dx.$
  // This pattern catches: $math$\command...$ and merges them
  result = result.replace(/\$([^$\n]+)\$\\([,;:\s]*)([a-zA-Z]+)\.?\$?/g, (_match, math, spacing, rest) => {
    // Reconstruct as single math expression
    const spacingCmd = spacing ? `\\${spacing}` : ' ';
    return `$${math}${spacingCmd}${rest}$`;
  });

  // Fix: $content$\,text.$ pattern (LaTeX spacing command after closing $)
  // Example: $I=\int...$\,dx.$ → $I=\int... \, dx$
  result = result.replace(/\$([^$\n]+)\$\\,\s*([a-zA-Z]+)\.\$$/gm, '$$$1 \\, $2$$');

  // Fix: Split math expressions like $a$+$b$ → $a+b$
  // Only for simple cases where the content between is a single operator
  result = result.replace(/\$([^$\n]+)\$([+\-*/=])\$([^$\n]+)\$/g, '$$$1$2$3$$');

  // Fix: $content$$ (inline ending with double dollar) → $content$
  result = result.replace(/\$([^$\n]+)\$\$/g, '$$$1$$');

  // Fix: $$content$ (display starting, inline ending) → $content$
  result = result.replace(/\$\$([^$\n]+)\$([^$])/g, '$$$1$$$2');

  // Fix: $$ followed by $$ with only whitespace/punctuation between
  result = result.replace(/\$\$([.,;:!?\s]*)\$\$/g, '$1');

  // Fix: Orphan $ at end of math expressions
  result = result.replace(/\$\$([^$]+)\$\s+\$/g, '$$$$$1$$$$');

  // Fix: Mixed inline/display on same conceptual expression
  // Pattern: $ $$content$$ → $$content$$
  result = result.replace(/\$\s*\$\$([^$]+)\$\$/g, '$$$$$1$$$$');

  // Fix: content$$, or content$$ (display math delimiter after content without opening)
  result = result.replace(/([a-zA-Z0-9})])\$\$([,.\s]|$)/g, '$1$$$2');

  // Fix: Trailing orphan $ after punctuation at line end
  // Example: $math$. $ or $math$.$  → $math$.
  result = result.replace(/\$([^$\n]+)\$([.,;:!?])\s*\$\s*$/gm, '$$$1$$$2');

  // Fix: $content$. followed by orphan $ on same context
  // Pattern: something $math$.$  (note the trailing $)
  result = result.replace(/\$([^$\n]+)\$\.(\s*)\$/g, '$$$1$$.$2');

  // Fix: Integral expressions where \,dx is split out
  // Pattern: $\int...f(x)$\,dx or $\int...f(x)$\,dx.$
  // Should become: $\int...f(x)\,dx$
  result = result.replace(/\$(\\int[^$]*)\$\\,\s*(d[xyztruvw])\.?\$?/gi, '$$$1 \\, $2$$');

  // Fix: More general case of LaTeX commands after closing $
  // Pattern: $content$\command → $content \command$
  // This catches cases like $f(x)$\cdot$g(x)$ → $f(x) \cdot g(x)$
  result = result.replace(/\$([^$\n]+)\$\\(cdot|times|pm|mp|div|cap|cup|wedge|vee|oplus|otimes)\$([^$\n]+)\$/gi,
    '$$$1 \\$2 $3$$');

  // Fix: Unmatched $ at end of line after valid math
  // Pattern: "text $math$ extra $" → "text $math$ extra"
  result = result.replace(/\$([^$\n]+)\$([^$\n]*)\$\s*$/gm, (_match, math, between) => {
    // Only apply if 'between' doesn't contain LaTeX commands
    if (/\\[a-zA-Z]/.test(between)) {
      // It has LaTeX, merge it back
      return `$${math}${between}$`;
    }
    // No LaTeX in between, just remove trailing $
    return `$${math}$${between}`;
  });

  // ========================================================================
  // STEP 0.75: Wrap obvious LaTeX expressions that have NO delimiters at all
  // This handles AI reasoning output where LaTeX commands appear without $...$
  // Example: "E=mc^2" or "G_{\mu\nu}+\Lambda g_{\mu\nu}=\frac{8\pi G}{c^4}T_{\mu\nu}"
  // ========================================================================
  {
    // Process line by line, looking for lines without $ that have LaTeX
    const processedLines = result.split('\n').map(line => {
      // Skip if line already has math delimiters
      if (/(?<!\\)\$/.test(line)) return line;

      // Skip code blocks and emphasis placeholders
      if (line.trim().startsWith('```') || /^⟦/.test(line.trim())) return line;

      // Skip markdown links
      if (/\[[^\]]*\]\([^)]+\)/.test(line)) return line;

      // Strategy: Find specific LaTeX patterns and wrap them with context
      let modified = line;

      // 1. Wrap \frac{...}{...} with surrounding context
      modified = modified.replace(
        /([A-Za-z0-9+\-*/=<>()[\]{}\\,.\s]*\\frac\{[^{}]*\}\{[^{}]*\}[A-Za-z0-9+\-*/=<>()[\]{}\\,.\s]*)/g,
        (match) => {
          if (match.includes('$')) return match;
          const trimmed = match.trim();
          return trimmed ? ` $${trimmed}$ ` : match;
        }
      );

      // 2. Wrap expressions with Greek letters: \mu, \nu, \alpha, etc.
      modified = modified.replace(
        /([A-Za-z0-9_^{}+\-*/=<>()[\]\\,.\s]*\\(?:mu|nu|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|rho|sigma|tau|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|pi|infty)(?![a-zA-Z])[A-Za-z0-9_^{}+\-*/=<>()[\]\\,.\s]*)/g,
        (match) => {
          if (match.includes('$')) return match;
          const trimmed = match.trim();
          return trimmed ? ` $${trimmed}$ ` : match;
        }
      );

      // 3. Wrap expressions with integrals, sums, etc.
      modified = modified.replace(
        /([A-Za-z0-9_^{}+\-*/=<>()[\]\\,.\s]*\\(?:int|iint|iiint|oint|sum|prod|lim|sqrt)(?:\{[^{}]*\}|[_^][{]?[^{}\s]+[}]?)*[A-Za-z0-9_^{}+\-*/=<>()[\]\\,.\s]*)/g,
        (match) => {
          if (match.includes('$')) return match;
          const trimmed = match.trim();
          return trimmed ? ` $${trimmed}$ ` : match;
        }
      );

      // 4. Wrap expressions with subscripts/superscripts in braces: X_{...} or X^{...}
      modified = modified.replace(
        /([A-Za-z][A-Za-z0-9]*[_^]\{[^{}]+\}(?:[+\-*/=<>]?[A-Za-z0-9_^{}]*)*)/g,
        (match) => {
          if (match.includes('$')) return match;
          // Don't wrap if it's just a variable name
          if (!/[_^]\{/.test(match)) return match;
          return ` $${match.trim()}$ `;
        }
      );

      // 5. Wrap simple equations like E=mc^2 (letter=letters with ^)
      modified = modified.replace(
        /\b([A-Za-z]=[A-Za-z0-9]+\^[0-9]+)\b/g,
        (match) => {
          if (match.includes('$')) return match;
          return ` $${match}$ `;
        }
      );

      // 6. Clean up multiple spaces and trim $ $ patterns
      modified = modified.replace(/\s+/g, ' ').replace(/\$\s+\$/g, '').trim();

      // Only return modified if we actually wrapped something
      if (modified !== line && modified.includes('$')) {
        return modified;
      }

      return line;
    });

    result = processedLines.join('\n');
  }

  // 1. Wrap display math environments (align, equation, gather, etc.)
  // Match environments that span multiple lines
  result = result.replace(
    /\\begin\{(align|equation|gather|multline|alignat|flalign|eqnarray|array|matrix|pmatrix|bmatrix|vmatrix|cases)\*?\}[\s\S]*?\\end\{\1\*?\}/g,
    (match) => {
      // Check if already wrapped
      const idx = result.indexOf(match);
      const before = result.slice(Math.max(0, idx - 2), idx);
      if (before.endsWith('$$')) return match;
      return `\n\n$$\n${match}\n$$\n\n`;
    }
  );

  // 2. Wrap standalone \[ ... \] display math (already standard LaTeX)
  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, inner) => `\n\n$$${inner.trim()}$$\n\n`
  );

  // 3. Wrap inline \( ... \) math
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, inner) => `$${inner}$`
  );

  // 3.5. Detect and wrap raw LaTeX command sequences (AI often outputs these without delimiters)
  // This catches patterns like: \nabla u \cdot \nabla v = 0, \delta E = \int..., etc.
  {
    // Common LaTeX commands that indicate math content
    const latexCommands = [
      'nabla', 'partial', 'delta', 'Delta', 'alpha', 'beta', 'gamma', 'Gamma',
      'theta', 'Theta', 'lambda', 'Lambda', 'mu', 'nu', 'xi', 'Xi', 'pi', 'Pi',
      'sigma', 'Sigma', 'tau', 'phi', 'Phi', 'psi', 'Psi', 'omega', 'Omega',
      'epsilon', 'varepsilon', 'zeta', 'eta', 'kappa', 'rho', 'chi', 'upsilon',
      'int', 'iint', 'iiint', 'oint', 'sum', 'prod', 'lim', 'infty',
      'frac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'mp',
      'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong', 'propto',
      'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'ni',
      'forall', 'exists', 'nexists', 'emptyset', 'varnothing',
      'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow', 'to', 'mapsto',
      'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan',
      'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'det', 'dim', 'ker', 'deg',
      'min', 'max', 'sup', 'inf', 'gcd', 'lcm', 'binom', 'choose',
      'vec', 'hat', 'bar', 'dot', 'ddot', 'tilde', 'overline', 'underline',
      'overbrace', 'underbrace', 'overset', 'underset',
      'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
      'quad', 'qquad', 'text', 'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathbb',
    ].join('|');

    // Split by code blocks to avoid processing them
    const codeParts = result.split(/(```[\s\S]*?```)/g);

    // Create regex for detecting LaTeX commands
    const latexCommandRegex = new RegExp(`\\\\(${latexCommands})(?![a-zA-Z])`, 'g');

    result = codeParts.map((part) => {
      if (part.startsWith('```')) return part;

      // Process each line separately
      return part.split('\n').map((line) => {
        // Skip lines that already have math delimiters
        if (/(?<!\\)\$/.test(line)) return line;

        // Skip lines that contain markdown links to avoid corrupting them
        // Matches [text](url) pattern
        if (/\[[^\]]*\]\([^)]+\)/.test(line)) return line;

        // Check if line contains raw LaTeX commands
        if (!latexCommandRegex.test(line)) {
          latexCommandRegex.lastIndex = 0; // Reset regex state
          return line;
        }
        latexCommandRegex.lastIndex = 0; // Reset regex state

        // Strategy: Find sequences that contain LaTeX commands and wrap them
        // Split line into segments by common delimiters (colons, periods followed by space, etc.)
        // but keep the delimiters

        let processed = '';
        let lastIndex = 0;

        // Find all LaTeX command sequences and their surrounding math context
        // Match pattern: optional prefix (like "E = ") + LaTeX commands + math content
        const mathExprRegex = new RegExp(
          `(` +
            // Optional variable/identifier prefix before = or :
            `(?:[a-zA-Z][a-zA-Z0-9']*\\s*(?:[=:<>]|:=)\\s*)?` +
            // Main LaTeX expression with commands
            `(?:` +
              `(?:[-+]?\\s*)?` + // Optional sign
              `(?:` +
                `\\\\(?:${latexCommands})` + // LaTeX command
                `(?:\\s*[_^]\\s*(?:\\{[^{}]*\\}|[a-zA-Z0-9]))?` + // Optional sub/superscript
                `(?:\\s*\\{[^{}]*\\})*` + // Optional arguments
              `|` +
                `[a-zA-Z][a-zA-Z0-9']*` + // Variable name
              `|` +
                `[0-9]+(?:\\.[0-9]+)?` + // Number
              `|` +
                `[=+\\-*/^_{}()\\[\\]|<>·,]` + // Operators and delimiters
              `|` +
                `\\s+` + // Whitespace
              `)+` +
            `)` +
          `)`,
          'g'
        );

        let match;
        while ((match = mathExprRegex.exec(line)) !== null) {
          const expr = match[1];
          const startIdx = match.index;

          // Check if this expression contains LaTeX commands
          latexCommandRegex.lastIndex = 0;
          if (!latexCommandRegex.test(expr)) {
            continue;
          }
          latexCommandRegex.lastIndex = 0;

          // Add text before this match
          if (startIdx > lastIndex) {
            processed += line.slice(lastIndex, startIdx);
          }

          // Check if already wrapped
          const beforeChar = startIdx > 0 ? line[startIdx - 1] : '';
          const afterChar = startIdx + expr.length < line.length ? line[startIdx + expr.length] : '';

          if (beforeChar === '$' || afterChar === '$') {
            processed += expr;
          } else {
            // Wrap in $ delimiters
            const trimmedExpr = expr.trim();
            const leadingWs = expr.match(/^\s*/)?.[0] || '';
            const trailingWs = expr.match(/\s*$/)?.[0] || '';
            processed += `${leadingWs}$${trimmedExpr}$${trailingWs}`;
          }

          lastIndex = startIdx + expr.length;
        }

        // Add remaining text
        if (lastIndex < line.length) {
          processed += line.slice(lastIndex);
        }

        return processed || line;
      }).join('\n');
    }).join('');
  }

  // 4. Normalize math runs and add delimiters where missing.
  {
    const parts = result.split(/(```[\s\S]*?```)/g);

    const greekOrSymbol =
      /[α-ωΑ-ΩφΦπΠλΛμΜθΘσΣγΓβΒΔδρΡ∇∞∑∏∫∮∯∬∭≈≠≤≥±×÷·→←↔⇒⇔≡∂]/;
    const operator = /[=<>^_+*/|]/;
    const digit = /\d/;
    const backslash = /\\/;
    const stripPunctuation = (token: string) =>
      token.replace(/^[\s"'\[{(]+|[\s"'\]})\.,;:!?]+$/g, "");

    const classifyToken = (token: string): "strong" | "weak" | "none" => {
      const stripped = stripPunctuation(token);
      if (!stripped) return "none";

      // Skip markdown emphasis patterns - don't treat **bold** or *italic* as math
      // Match patterns like **word**, *word*, __word__, _word_
      if (/^(\*{1,2}|_{1,2})[^*_]+(\*{1,2}|_{1,2})$/.test(token)) return "none";
      // Also skip standalone emphasis markers
      if (/^\*{1,2}$/.test(token) || /^_{1,2}$/.test(token)) return "none";

      const hasBackslash = backslash.test(stripped);
      const hasGreek = greekOrSymbol.test(stripped);
      const hasOperator = operator.test(stripped);
      const hasDigit = digit.test(stripped);
      const hasBracket = /[()[\]|]/.test(stripped);
      const hasLetter = /[A-Za-z]/.test(stripped);

      // Only treat * as math operator if it's not at word boundaries (markdown emphasis)
      // Check if operator is ONLY asterisks - if so, likely markdown, not math
      const operatorsWithoutAsterisk = stripped.replace(/\*/g, '');
      const hasNonAsteriskOperator = /[=<>^_+/|]/.test(operatorsWithoutAsterisk);
      const hasMathOperator = hasNonAsteriskOperator || (hasOperator && (hasDigit || hasGreek || hasBackslash));

      if (hasBackslash || hasGreek) return "strong";
      if (hasMathOperator) return "strong";
      if (hasDigit && (hasNonAsteriskOperator || hasBracket)) return "strong";

      if (/^[a-zA-Z]$/.test(stripped)) return "weak";
      if (/^d[xyztruvw]$/i.test(stripped)) return "weak"; // dx, dy, dt
      if (/^[a-zA-Z]['′]+$/.test(stripped)) return "weak"; // X'', f'
      if (/^[a-zA-Z]\w*\([^)]*\)$/.test(stripped)) return "weak"; // f(x)
      if (hasBracket && hasLetter) return "weak";
      return "none";
    };

    const splitByDollar = (line: string) => {
      const segments: Array<{ text: string; inMath: boolean }> = [];
      let buf = "";
      let inMath = false;
      let delim: "$" | "$$" | null = null;
      let i = 0;
      while (i < line.length) {
        const ch = line[i];
        if (ch === "\\" && line[i + 1] === "$") {
          buf += "$";
          i += 2;
          continue;
        }
        if (!inMath && ch === "$") {
          const isBlock = line[i + 1] === "$";
          segments.push({ text: buf, inMath: false });
          buf = isBlock ? "$$" : "$";
          inMath = true;
          delim = isBlock ? "$$" : "$";
          i += isBlock ? 2 : 1;
          continue;
        }
        if (inMath && ch === "$") {
          if (delim === "$$" && line[i + 1] === "$") {
            buf += "$$";
            segments.push({ text: buf, inMath: true });
            buf = "";
            inMath = false;
            delim = null;
            i += 2;
            continue;
          }
          if (delim === "$") {
            buf += "$";
            segments.push({ text: buf, inMath: true });
            buf = "";
            inMath = false;
            delim = null;
            i += 1;
            continue;
          }
        }
        buf += ch;
        i += 1;
      }
      if (buf.length > 0) segments.push({ text: buf, inMath });
      return segments;
    };

    const normalizeUnicodeMath = (text: string) =>
      text
        .replace(/∇/g, "\\nabla ")
        .replace(/∂/g, "\\partial ")
        .replace(/∫/g, "\\int ")
        .replace(/∮/g, "\\oint ")
        .replace(/∯|∬/g, "\\iint ")
        .replace(/∭/g, "\\iiint ")
        .replace(/∑/g, "\\sum ")
        .replace(/∏/g, "\\prod ")
        .replace(/≤/g, "\\leq ")
        .replace(/≥/g, "\\geq ")
        .replace(/≠/g, "\\neq ")
        .replace(/≈/g, "\\approx ")
        .replace(/±/g, "\\pm ")
        .replace(/×/g, "\\times ")
        .replace(/÷/g, "\\div ")
        .replace(/·/g, "\\cdot ")
        .replace(/→/g, "\\to ")
        .replace(/←/g, "\\leftarrow ")
        .replace(/↔/g, "\\leftrightarrow ")
        .replace(/⇒/g, "\\Rightarrow ")
        .replace(/⇔/g, "\\Leftrightarrow ")
        .replace(/α/g, "\\alpha ")
        .replace(/β/g, "\\beta ")
        .replace(/γ/g, "\\gamma ")
        .replace(/δ/g, "\\delta ")
        .replace(/ε/g, "\\epsilon ")
        .replace(/ζ/g, "\\zeta ")
        .replace(/η/g, "\\eta ")
        .replace(/θ/g, "\\theta ")
        .replace(/ι/g, "\\iota ")
        .replace(/κ/g, "\\kappa ")
        .replace(/λ/g, "\\lambda ")
        .replace(/μ/g, "\\mu ")
        .replace(/ν/g, "\\nu ")
        .replace(/ξ/g, "\\xi ")
        .replace(/ο/g, "o")
        .replace(/ρ/g, "\\rho ")
        .replace(/σ/g, "\\sigma ")
        .replace(/τ/g, "\\tau ")
        .replace(/υ/g, "\\upsilon ")
        .replace(/χ/g, "\\chi ")
        .replace(/ψ/g, "\\psi ")
        .replace(/ω/g, "\\omega ")
        .replace(/Α/g, "A")
        .replace(/Β/g, "B")
        .replace(/Γ/g, "\\Gamma ")
        .replace(/Δ/g, "\\Delta ")
        .replace(/Ε/g, "E")
        .replace(/Ζ/g, "Z")
        .replace(/Η/g, "H")
        .replace(/Θ/g, "\\Theta ")
        .replace(/Ι/g, "I")
        .replace(/Κ/g, "K")
        .replace(/Λ/g, "\\Lambda ")
        .replace(/Μ/g, "M")
        .replace(/Ν/g, "N")
        .replace(/Ξ/g, "\\Xi ")
        .replace(/Ο/g, "O")
        .replace(/Π/g, "\\Pi ")
        .replace(/Ρ/g, "P")
        .replace(/Σ/g, "\\Sigma ")
        .replace(/Τ/g, "T")
        .replace(/Υ/g, "\\Upsilon ")
        .replace(/Φ/g, "\\Phi ")
        .replace(/Χ/g, "X")
        .replace(/Ψ/g, "\\Psi ")
        .replace(/Ω/g, "\\Omega ")
        .replace(/φ/g, "\\phi ")
        .replace(/π/g, "\\pi ");

    const wrapInlineMath = (line: string) => {
      // Note: Markdown emphasis is already protected at the top level of preprocessLatex
      // Placeholders like ⟦EMB0⟧ are treated as regular text (not math)

      // If line has no LaTeX indicators, return as-is
      if (!backslash.test(line) && !greekOrSymbol.test(line) && !operator.test(line)) {
        return line;
      }

      const tokens = line.split(/(\s+)/);
      const types = tokens.map((t) => {
        if (/^\s+$/.test(t)) return "space";
        // Emphasis placeholders should be treated as "none" (not math)
        if (/^⟦EM[BIU]{1,2}\d+⟧$/.test(t)) return "none";
        return classifyToken(t);
      });

      let out = "";
      let i = 0;
      while (i < tokens.length) {
        if (types[i] === "space" || types[i] === "none") {
          out += tokens[i];
          i += 1;
          continue;
        }
        let j = i;
        let hasStrong = false;
        let span = "";
        while (j < tokens.length && (types[j] === "space" || types[j] !== "none")) {
          if (types[j] === "strong") hasStrong = true;
          span += tokens[j];
          j += 1;
        }
        if (hasStrong) {
          const leading = span.match(/^\s+/)?.[0] ?? "";
          const trailing = span.match(/\s+$/)?.[0] ?? "";
          const core = span.slice(leading.length, span.length - trailing.length);
          out += `${leading}$${normalizeUnicodeMath(core)}$${trailing}`;
        } else {
          out += span;
        }
        i = j;
      }

      return out;
    };

    const isMathLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const tokens = trimmed.split(/\s+/);
      let strongCount = 0;
      let mathCount = 0;
      let wordCount = 0;
      for (const token of tokens) {
        const type = classifyToken(token);
        if (type === "strong") strongCount += 1;
        if (type !== "none") mathCount += 1;
        if (/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(token)) wordCount += 1;
      }
      if (wordCount >= 2) return false;
      const ratio = mathCount / Math.max(1, tokens.length);
      return strongCount >= 2 && mathCount >= 3 && ratio >= 0.65;
    };

    const isMathContinuation = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^[=+\-]/.test(trimmed) || greekOrSymbol.test(trimmed) || operator.test(trimmed);
    };

    // Regex to detect markdown links: [text](url)
    const markdownLinkRegex = /\[[^\]]*\]\([^)]+\)/;

    result = parts
      .map((part) => {
        if (part.startsWith("```")) return part;
        const lines = part.split("\n");
        const out: string[] = [];
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];

          // Skip lines containing markdown links to avoid corrupting them
          if (markdownLinkRegex.test(line)) {
            out.push(line);
            continue;
          }

          // Note: Markdown emphasis (**bold**, *italic*) is already protected
          // via placeholders (⟦EMB...⟧) in Step 0 at the top of preprocessLatex

          const hasDelim = /(?<!\\)\$/.test(line);

          // Handle standalone math lines that start with $ (inline math that should be display)
          // These often don't render correctly as $...$ so convert to $$...$$
          // Match: line starts with $, ends with $ (optionally followed by punctuation)
          const standaloneInlineMath = /^\$([^$]+)\$([.,;:!?]?)$/.exec(line.trim());
          if (standaloneInlineMath) {
            const mathContent = standaloneInlineMath[1];
            const trailingPunct = standaloneInlineMath[2] || '';
            out.push(`$$${mathContent}$$${trailingPunct}`);
            continue;
          }

          if (!hasDelim && isMathLine(line)) {
            const block = [line];
            let j = i + 1;
            while (j < lines.length && isMathContinuation(lines[j])) {
              block.push(lines[j]);
              j += 1;
            }
            const normalizedBlock = block.map((l) => normalizeUnicodeMath(l));
            out.push(`$$\n${normalizedBlock.join("\n")}\n$$`);
            i = j - 1;
            continue;
          }
          if (hasDelim) {
            const segments = splitByDollar(line);
            const processed = segments
              .map((seg) =>
                seg.inMath
                  ? normalizeUnicodeMath(seg.text)
                  : wrapInlineMath(seg.text),
              )
              .join("");
            out.push(processed);
          } else {
            out.push(wrapInlineMath(line));
          }
        }
        return out.join("\n");
      })
      .join("");
  }

  // ========================================================================
  // FINAL STEP: Restore markdown emphasis patterns
  // ========================================================================
  for (const [placeholder, original] of emphasisPlaceholders) {
    result = result.split(placeholder).join(original);
  }

  return result;
}

/**
 * Fix collapsed markdown tables that some models (Cerebras/Llama/Groq) produce on a single line.
 * Example input:  "| H1 | H2 | |---|---| | D1 | D2 | | D3 | D4 |"
 * Example output: "| H1 | H2 |\n|---|---|\n| D1 | D2 |\n| D3 | D4 |"
 */
function fixCollapsedTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Detect an inline table separator: at least 2 columns of |---|---|
    const sepRegex =
      /\|[\s]*[-:]+[\s]*\|[\s]*[-:]+[\s]*(?:\|[\s]*[-:]+[\s]*)*\|/;
    const sepMatch = sepRegex.exec(line);

    if (!sepMatch || sepMatch[0].trim() === line.trim()) {
      // No inline separator, or separator already on its own line
      result.push(line);
      continue;
    }

    const separator = sepMatch[0].trim();
    const colCount = (separator.match(/\|/g) || []).length - 1;
    if (colCount < 2) {
      result.push(line);
      continue;
    }

    const pipesPerRow = colCount + 1;

    // Split the line around the separator for more robust handling
    const firstPipeIdx = line.indexOf("|");
    const leadingText =
      firstPipeIdx > 0 ? line.slice(0, firstPipeIdx).trim() : "";
    const beforeSep = line.slice(firstPipeIdx, sepMatch.index).trim();
    const afterSep = line.slice(sepMatch.index + sepMatch[0].length).trim();

    // Extract header and data rows
    const headerRows = beforeSep
      ? extractTableRows(beforeSep, pipesPerRow)
      : [];
    const dataRows = afterSep
      ? extractTableRows(afterSep, pipesPerRow)
      : [];

    // Need at least 1 header row and 1 data row for a valid table
    if (headerRows.length >= 1 && dataRows.length >= 1) {
      const rows: string[] = [];
      if (leadingText) rows.push(leadingText);
      rows.push(...headerRows, separator, ...dataRows);
      result.push(rows.join("\n"));
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/** Extract individual table rows from collapsed text based on expected pipes per row */
function extractTableRows(text: string, pipesPerRow: number): string[] {
  const pipePositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|") pipePositions.push(i);
  }

  if (pipePositions.length < pipesPerRow) {
    // Not enough pipes for a complete row — return as-is if non-empty
    return text.trim() ? [text.trim()] : [];
  }

  const rows: string[] = [];
  let i = 0;

  // Extract complete rows (groups of pipesPerRow pipes)
  while (i + pipesPerRow - 1 < pipePositions.length) {
    const start = pipePositions[i];
    const end = pipePositions[i + pipesPerRow - 1];
    rows.push(text.slice(start, end + 1).trim());
    i += pipesPerRow;
  }

  // Handle remaining incomplete row (e.g., during streaming)
  if (i < pipePositions.length) {
    const start = pipePositions[i];
    const remaining = text.slice(start).trim();
    if (remaining) {
      rows.push(remaining);
    }
  }

  return rows;
}

function sanitizeMarkdown(content: string): string {
  const generatedFileHint = (label: string) => {
    const text = label.trim();
    if (!text) return "Generated file (use chat download button)";
    if (/download button|generated file/i.test(text)) return text;
    return `${text} (use chat download button)`;
  };

  // Fix collapsed tables BEFORE LaTeX processing (prevents pipe corruption)
  const withTables = fixCollapsedTables(content);

  // Then preprocess LaTeX
  const withLatex = preprocessLatex(withTables);

  return withLatex
    .replace(/^[\t ]*[-*+][\t ]*$/gm, "")
    .replace(/^[\t ]*[-*+][\t ]+(?:\s|\u200B|\u200C|\u200D|\uFEFF)*$/gm, "")
    .replace(/^[\t ]*\d+\.[\t ]*$/gm, "")
    .replace(/^[\t ]*\d+\.[\t ]+(?:\s|\u200B|\u200C|\u200D|\uFEFF)*$/gm, "")
    // Remove code interpreter sandbox file links (unsupported protocol, renders as [blocked])
    .replace(/\[([^\]]*)\]\(sandbox:\/[^)]*\)/g, (_m, label) => generatedFileHint(label))
    .replace(/\[([^\]]*)\]\(\/mnt\/data\/[^)]*\)/g, (_m, label) => generatedFileHint(label))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Tailwind Typography prose size classes
const proseSizeClasses = {
  sm: "prose-sm",
  md: "prose-base",
  lg: "prose-lg",
};

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
  content,
  size = "md",
  className,
  isAnimating = false,
  documentCitations = [],
}: ChatMarkdownRendererProps) {
  const sanitizedContent = useMemo(() => sanitizeMarkdown(content), [content]);
  const { navigateToCitation } = useCitationNavigation();
  const [mermaidPlugin, setMermaidPlugin] = useState<any>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect theme for Mermaid
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Try to load mermaid plugin dynamically (may fail if lodash-es is not installed)
  useEffect(() => {
    import("@streamdown/mermaid")
      .then((module) => {
        // Use the default mermaid export - config is passed via Streamdown's mermaid prop
        if (module.mermaid) {
          setMermaidPlugin(() => module.mermaid);
        } else if (module.createMermaidPlugin) {
          // Fallback to creating a plugin with no config
          setMermaidPlugin(() => module.createMermaidPlugin());
        }
      })
      .catch(() => {
        // Mermaid not available - this is OK, diagrams just won't render
        // This happens when lodash-es fails to install due to Windows permissions
        console.warn(
          "[ChatMarkdownRenderer] Mermaid plugin not available (lodash-es may not be installed). Diagrams will not render.",
        );
      });
  }, []);

  const plugins = useMemo(() => {
    const basePlugins: any = {
      code,
      math: createMathPlugin({
        singleDollarTextMath: true, // Enable $...$ inline math syntax
        errorColor: "var(--destructive)", // Show errors in theme's destructive color
      }),
    };
    // Only include mermaid if it's available (may fail if lodash-es didn't install)
    if (mermaidPlugin) {
      basePlugins.mermaid = mermaidPlugin;
    }
    return basePlugins;
  }, [mermaidPlugin]);

  // Mermaid config for Streamdown's mermaid prop
  const mermaidConfig = useMemo(() => ({
    config: {
      theme: isDark ? "dark" : "default",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      securityLevel: "strict",
      startOnLoad: false, // We handle rendering manually
      flowchart: {
        htmlLabels: true,
        curve: "basis",
        nodeSpacing: 50,
        rankSpacing: 50,
      },
      sequence: {
        actorMargin: 50,
        boxMargin: 10,
        useMaxWidth: true,
      },
      themeVariables: isDark ? {
        primaryColor: "#3b82f6",
        primaryTextColor: "#f8fafc",
        primaryBorderColor: "#1e40af",
        lineColor: "#64748b",
        secondaryColor: "#1e293b",
        tertiaryColor: "#0f172a",
        background: "#020617",
        mainBkg: "#1e293b",
        nodeBorder: "#334155",
        clusterBkg: "#1e293b",
        titleColor: "#f8fafc",
        edgeLabelBackground: "#1e293b",
      } : {
        primaryColor: "#3b82f6",
        primaryTextColor: "#0f172a",
        primaryBorderColor: "#1d4ed8",
        lineColor: "#64748b",
        secondaryColor: "#f1f5f9",
        tertiaryColor: "#e2e8f0",
        background: "#ffffff",
        mainBkg: "#f8fafc",
        nodeBorder: "#cbd5e1",
        clusterBkg: "#f1f5f9",
        titleColor: "#0f172a",
        edgeLabelBackground: "#ffffff",
      },
    },
  } as const), [isDark]);

  const wrapWithCitations = useCallback(
    (children: ReactNode) => {
      return (
        <TextWithCitations
          citations={documentCitations}
          onNavigate={navigateToCitation}
        >
          {children}
        </TextWithCitations>
      );
    },
    [documentCitations, navigateToCitation],
  );

  return (
    <div
      className={cn(
        // Base prose with Typography plugin
        "prose prose-neutral dark:prose-invert",
        proseSizeClasses[size],
        // Width and overflow control
        "w-full max-w-none overflow-hidden",
        // Custom prose styling overrides
        // Headings
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-4",
        "prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-3",
        "prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2",
        // Paragraphs
        "prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:my-3",
        // Links handled by custom component
        "prose-a:no-underline",
        // Lists
        "prose-ul:my-3 prose-ul:pl-5",
        "prose-ol:my-3 prose-ol:pl-5",
        "prose-li:text-foreground/90 prose-li:my-1 prose-li:marker:text-muted-foreground",
        // Strong/Bold
        "prose-strong:font-semibold prose-strong:text-foreground",
        // Blockquotes
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:py-1",
        "prose-blockquote:text-foreground/80 prose-blockquote:not-italic prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg",
        // Inline code
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:bg-muted prose-code:text-foreground prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[0.875em] prose-code:font-normal",
        // HR
        "prose-hr:border-border/50 prose-hr:my-6",
        // Images
        "prose-img:rounded-xl prose-img:border prose-img:border-border/30",
        className,
      )}
    >
      <Streamdown
        plugins={plugins}
        mermaid={mermaidPlugin ? mermaidConfig : undefined}
        isAnimating={isAnimating}
        caret={isAnimating ? "block" : undefined}
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
          li: ({ children, ...props }: any) => {
            // Safeguard: ensure children are rendered even if undefined
            const content = children ?? '';
            return (
              <li {...props} className={cn(props.className, "text-foreground/90")}>
                {wrapWithCitations(content)}
              </li>
            );
          },

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
            <del className="text-muted-foreground" {...props}>
              {wrapWithCitations(children)}
            </del>
          ),

          // Blockquotes
          blockquote: ({ children, ...props }: any) => (
            <blockquote {...props}>{children}</blockquote>
          ),

          // HR
          hr: () => <hr />,

          // Tables - Premium styling
          table: ({ children, ...props }: any) => (
            <TableBlock {...props}>{children}</TableBlock>
          ),
          thead: ({ children, ...props }: any) => (
            <thead className="bg-muted/50 border-b border-border/50" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }: any) => (
            <tbody className="divide-y divide-border/30" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }: any) => (
            <tr className="hover:bg-muted/20 transition-colors" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }: any) => (
            <th
              className="text-left font-medium px-4 py-3 text-foreground text-xs uppercase tracking-wider"
              {...props}
            >
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
            const isBlockCode = codeClassName?.includes("language-");
            if (isBlockCode) {
              return (
                <code
                  className={cn(
                    codeClassName,
                    "text-[13px] font-mono leading-relaxed",
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            const raw = getText(children);
            const latexHtml = tryRenderLatex(raw);
            if (latexHtml) {
              return <span dangerouslySetInnerHTML={{ __html: latexHtml }} />;
            }
            return <code {...props}>{children}</code>;
          },

          // Images
          img: ({ src, alt, ...props }: any) => (
            <img src={src} alt={alt} loading="lazy" decoding="async" {...props} />
          ),
        }}
      >
        {sanitizedContent}
      </Streamdown>
    </div>
  );
});

// Compact version
export const CompactMarkdownRenderer = memo(function CompactMarkdownRenderer({
  content,
  className,
  documentCitations,
}: {
  content: string;
  className?: string;
  documentCitations?: CitationData[];
}) {
  return (
    <ChatMarkdownRenderer
      content={content}
      size="sm"
      className={className}
      documentCitations={documentCitations}
    />
  );
});

export type { CitationData };
