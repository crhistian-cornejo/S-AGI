const NULL_LANGUAGE_VALUES = new Set([
  "text",
  "plaintext",
  "plain",
  "none",
  "nohighlight",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  python: "python",
  sh: "shellscript",
  shell: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  shellscript: "shellscript",
  tex: "latex",
  latex: "latex",
  tsconfig: "json",
  jsconfig: "json",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  "c#": "csharp",
  cs: "csharp",
  csharp: "csharp",
  go: "go",
  golang: "go",
  rs: "rust",
  rust: "rust",
  html: "html",
  css: "css",
  sql: "sql",
  diff: "diff",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  toml: "toml",
  xml: "xml",
  graphql: "graphql",
  gql: "graphql",
  java: "java",
  kotlin: "kotlin",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  php: "php",
  ruby: "ruby",
};

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  json: "JSON",
  markdown: "Markdown",
  md: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  python: "Python",
  py: "Python",
  shellscript: "Shell",
  bash: "Bash",
  sh: "Shell",
  zsh: "Zsh",
  latex: "LaTeX",
  tex: "TeX",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  diff: "Diff",
  dockerfile: "Dockerfile",
  toml: "TOML",
  xml: "XML",
  graphql: "GraphQL",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  csharp: "C#",
  "c#": "C#",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  php: "PHP",
  ruby: "Ruby",
};

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeLanguageId(input?: string | null): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw || NULL_LANGUAGE_VALUES.has(raw)) return null;
  return LANGUAGE_ALIASES[raw] ?? raw;
}

export function getLanguageLabel(input?: string | null): string {
  if (!input) return "Code";
  const raw = input.trim().toLowerCase();
  if (!raw || NULL_LANGUAGE_VALUES.has(raw)) return "Code";
  return LANGUAGE_LABELS[raw] ?? LANGUAGE_LABELS[normalizeLanguageId(raw) ?? ""] ?? toTitleCase(raw);
}

function detectShebang(text: string): string | null {
  const match = text.match(/^#!\s*(?:\/usr\/bin\/env\s+)?([^\s]+)/);
  if (!match) return null;
  const cmd = match[1].toLowerCase();
  if (cmd.includes("python")) return "python";
  if (cmd.includes("node") || cmd.includes("deno")) return "javascript";
  if (cmd.includes("ts-node")) return "typescript";
  if (cmd.includes("bash") || cmd.includes("sh") || cmd.includes("zsh")) return "shellscript";
  if (cmd.includes("ruby")) return "ruby";
  if (cmd.includes("php")) return "php";
  return null;
}

function looksLikeJson(text: string): boolean {
  if (!/^\s*[\[{]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function looksLikeToml(text: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/m.test(text) && /^\s*[^#\s=]+\s*=\s*.+$/m.test(text);
}

function looksLikeYaml(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 50);
  const contentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#");
  });
  if (contentLines.length < 3) return false;
  const yamlLines = contentLines.filter((line) =>
    /^\s*-\s+/.test(line) || /^\s*[^\s:]+\s*:\s*/.test(line)
  );
  const ratio = yamlLines.length / contentLines.length;
  return ratio >= 0.6 && !/[{};]/.test(text);
}

function looksLikeSql(text: string): boolean {
  return /\b(select|insert|update|delete|create|alter|drop|with)\b/i.test(text) && /\bfrom\b/i.test(text);
}

function looksLikeLatex(text: string): boolean {
  // Document-level LaTeX
  if (/\\documentclass\b|\\usepackage\b|\\begin\{document\}/.test(text)) return true;
  // Math environments and common commands
  if (/\\begin\{(equation|align|matrix|bmatrix|pmatrix|cases|gather|array)\*?\}/.test(text)) return true;
  // Common math notation
  if (/\\(frac|sum|int|prod|lim|infty|partial|nabla|sqrt|vec|hat|bar|dot)\b/.test(text)) return true;
  // Greek letters
  if (/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|phi|psi)\b/.test(text)) return true;
  // Operators and relations
  if (/\\(times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|subset|supset)\b/.test(text)) return true;
  // Display math delimiters or \left/\right pairs
  if (/\$\$|\\\[|\\\]|\\left\b|\\right\b/.test(text)) return true;
  return false;
}

function looksLikeXml(text: string): boolean {
  return /^\s*<\?xml\b/.test(text) || /xmlns\s*=/.test(text);
}

function looksLikeHtml(text: string): boolean {
  if (/<!doctype\s+html/i.test(text)) return true;
  if (/<html[\s>]/i.test(text)) return true;
  const hasTags = /<([a-z][\w-]*)(\s|>)/i.test(text) && /<\/[a-z][\w-]*>/i.test(text);
  const hasJsKeywords = /\b(import|export|from|const|let|function|class)\b/.test(text);
  return hasTags && !hasJsKeywords;
}

function looksLikeCss(text: string): boolean {
  // Exclude if it looks like a programming language
  if (/\b(def|class|function|const|let|var|import|from|return)\b/.test(text)) return false;
  // CSS at-rules
  if (/@(media|keyframes|supports|import|font-face|charset)\b/.test(text)) return true;
  // CSS selectors with common properties
  const hasCssSelector = /^[\s]*([.#]?[\w-]+|\*|:root)\s*\{/m.test(text);
  const hasCssProperty = /\b(color|background|margin|padding|border|font|display|position|width|height|flex|grid)\s*:/i.test(text);
  return hasCssSelector && hasCssProperty;
}

function looksLikeMarkdown(text: string): boolean {
  return /(^#{1,6}\s+|\n#{1,6}\s+|```|^>\s+|^\s*[-*+]\s+|^\s*\d+\.\s+)/m.test(text);
}

function detectJsx(text: string): "tsx" | "jsx" | null {
  const hasTag = /<([A-Za-z][\w-]*)(\s|>|\/>)/.test(text) && /<\/[A-Za-z][\w-]*>/.test(text);
  if (!hasTag) return null;
  const hasTsMarkers = /\binterface\b|\btype\b|\benum\b|:\s*[A-Za-z_]/.test(text);
  if (hasTsMarkers) return "tsx";
  return /\b(import|export)\b/.test(text) ? "jsx" : null;
}

function looksLikeTypeScript(text: string): boolean {
  const hasTsKeywords = /\b(interface|type|enum|implements|extends)\b/.test(text);
  const hasTypeAnnotations = /:\s*[A-Za-z_][\w<>,\s|]*\s*(?=[,;)=])/m.test(text);
  const hasTsSyntax = /\b(import|export|const|let|function|class|namespace)\b/.test(text);
  return (hasTsKeywords || hasTypeAnnotations) && hasTsSyntax;
}

function looksLikeJavaScript(text: string): boolean {
  return /\b(const|let|var|function|class|import|export)\b/.test(text) || /=>/.test(text);
}

function looksLikePython(text: string): boolean {
  const hasKeywords = /\b(def|class|import|from|elif|self)\b/.test(text);
  const hasBlockSyntax = /:\s*(#.*)?$/m.test(text);
  return hasKeywords && hasBlockSyntax;
}

function looksLikeGo(text: string): boolean {
  return /\bpackage\s+\w+/.test(text) && /\bfunc\s+\w+/.test(text);
}

function looksLikeRust(text: string): boolean {
  return /\bfn\s+\w+/.test(text) && /\b(let\s+mut|use\s+\w+)\b/.test(text);
}

function looksLikeJava(text: string): boolean {
  return /\bpublic\s+class\b|\bSystem\.out\.println\b|\bimport\s+java\./.test(text);
}

function looksLikeKotlin(text: string): boolean {
  return /\bfun\s+\w+\s*\(|\bdata\s+class\b|\bval\s+\w+\s*[:=]/.test(text);
}

function looksLikeSwift(text: string): boolean {
  return /\bimport\s+Foundation\b|\bfunc\s+\w+\s*\(|\bguard\b/.test(text);
}

function looksLikeCSharp(text: string): boolean {
  return /\busing\s+System\b|\bnamespace\s+\w+|\bpublic\s+class\b/.test(text);
}

function looksLikeCpp(text: string): boolean {
  return /#include\s*<iostream>|std::|cout\s*<<|cin\s*>>/.test(text);
}

function looksLikeC(text: string): boolean {
  return /#include\s*<stdio.h>|\bprintf\s*\(/.test(text);
}

function looksLikeRuby(text: string): boolean {
  return /\bdef\s+\w+|\bclass\s+\w+|\bputs\b/.test(text) && /\bend\b/.test(text);
}

function looksLikeShell(text: string): boolean {
  return /^\s*(export\s+\w+|set\s+-\w+|\w+=\S+)/m.test(text) || /\b(echo|fi|then|elif|function)\b/.test(text);
}

export function inferLanguageFromCode(code: string): string | null {
  const text = code.trim();
  if (!text) return null;
  const sample = text.slice(0, 5000);

  const shebang = detectShebang(sample);
  if (shebang) return normalizeLanguageId(shebang);

  if (/^diff --git|^@@|^\+\+\+|^---/m.test(sample)) return "diff";
  if (/^\s*FROM\s+/im.test(sample)) return "dockerfile";
  if (/^\s*<\?php/.test(sample)) return "php";
  if (looksLikeLatex(sample)) return "latex";
  if (looksLikeJson(sample)) return "json";
  if (looksLikeToml(sample)) return "toml";
  if (looksLikeYaml(sample)) return "yaml";
  if (looksLikeSql(sample)) return "sql";
  if (looksLikeXml(sample)) return "xml";
  const jsx = detectJsx(sample);
  if (jsx) return jsx;

  if (looksLikeHtml(sample)) return "html";
  if (looksLikeMarkdown(sample)) return "markdown";

  // Check programming languages BEFORE CSS (CSS regex can false-positive on f-strings, etc.)
  if (looksLikePython(sample)) return "python";
  if (looksLikeTypeScript(sample)) return "typescript";
  if (looksLikeJavaScript(sample)) return "javascript";

  // CSS after programming languages
  if (looksLikeCss(sample)) return "css";
  if (looksLikeGo(sample)) return "go";
  if (looksLikeRust(sample)) return "rust";
  if (looksLikeJava(sample)) return "java";
  if (looksLikeKotlin(sample)) return "kotlin";
  if (looksLikeSwift(sample)) return "swift";
  if (looksLikeCSharp(sample)) return "csharp";
  if (looksLikeCpp(sample)) return "cpp";
  if (looksLikeC(sample)) return "c";
  if (looksLikeRuby(sample)) return "ruby";

  return null;
}

export function languageMatchesCode(code: string, language?: string | null): boolean {
  const normalized = normalizeLanguageId(language);
  if (!normalized) return false;
  const sample = code.trim().slice(0, 5000);

  switch (normalized) {
    case "python":
      return looksLikePython(sample);
    case "typescript":
      return looksLikeTypeScript(sample);
    case "javascript":
      return looksLikeJavaScript(sample);
    case "tsx":
    case "jsx":
      return detectJsx(sample) !== null;
    case "html":
      return looksLikeHtml(sample);
    case "css":
      return looksLikeCss(sample);
    case "markdown":
      return looksLikeMarkdown(sample);
    case "json":
      return looksLikeJson(sample);
    case "yaml":
      return looksLikeYaml(sample);
    case "toml":
      return looksLikeToml(sample);
    case "sql":
      return looksLikeSql(sample);
    case "latex":
      return looksLikeLatex(sample);
    case "xml":
      return looksLikeXml(sample);
    case "dockerfile":
      return /^\s*FROM\s+/im.test(sample);
    case "diff":
      return /^diff --git|^@@|^\+\+\+|^---/m.test(sample);
    case "shellscript":
      return looksLikeShell(sample) || detectShebang(sample) === "shellscript";
    case "go":
      return looksLikeGo(sample);
    case "rust":
      return looksLikeRust(sample);
    case "java":
      return looksLikeJava(sample);
    case "kotlin":
      return looksLikeKotlin(sample);
    case "swift":
      return looksLikeSwift(sample);
    case "csharp":
      return looksLikeCSharp(sample);
    case "cpp":
      return looksLikeCpp(sample);
    case "c":
      return looksLikeC(sample);
    case "ruby":
      return looksLikeRuby(sample);
    default:
      return true;
  }
}
