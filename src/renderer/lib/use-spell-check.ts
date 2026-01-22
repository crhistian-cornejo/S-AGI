import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Typo from "typo-js";

/** A misspelled word with its position and suggested correction */
export interface MisspelledWord {
  word: string;
  startIndex: number;
  endIndex: number;
  suggestions: string[];
  bestSuggestion: string | null;
}

/** Autocomplete suggestion for the word being typed */
export interface AutocompleteSuggestion {
  original: string;
  completion: string;
  remainingText: string;
  startIndex: number;
  endIndex: number;
}

export interface SpellCheckResult {
  misspelledWords: MisspelledWord[];
  autocomplete: AutocompleteSuggestion | null;
  isLoaded: boolean;
  error: string | null;
  applyAllCorrections: () => string;
  applyAutocomplete: () => string | null;
  applyTab: (cursorPosition?: number | null) => {
    text: string;
    cursorPosition: number | null;
  };
  getCorrectedText: () => string;
  /** Auto-correct the word that just ended (call when space is pressed) */
  autoCorrectOnSpace: (
    text: string,
    cursorPosition: number,
  ) => { text: string; cursorPosition: number; corrected: boolean } | null;
}

function getBaseUrl(): string {
  const origin = window.location.origin;
  if (!origin || origin === "null" || origin.startsWith("file://")) {
    if (import.meta.env.DEV) {
      return "http://localhost:5173";
    }
    return "";
  }
  return origin;
}

const IGNORE_WORDS = new Set([
  "api",
  "url",
  "http",
  "https",
  "html",
  "css",
  "js",
  "ts",
  "json",
  "xml",
  "npm",
  "git",
  "github",
  "vscode",
  "typescript",
  "javascript",
  "react",
  "nodejs",
  "webpack",
  "vite",
  "eslint",
  "prettier",
  "docker",
  "kubernetes",
  "mongodb",
  "postgresql",
  "mysql",
  "redis",
  "graphql",
  "restful",
  "oauth",
  "jwt",
  "auth",
  "async",
  "await",
  "const",
  "let",
  "var",
  "func",
  "def",
  "etc",
  "vs",
  "ie",
  "eg",
  "ok",
  "info",
  "config",
  "env",
  "dev",
  "prod",
  "tb",
  "xq",
  "pq",
  "q",
  "k",
  "x",
  "d",
  "xd",
  "jaja",
  "jeje",
  "jiji",
  "tmb",
  "tbien",
  "bn",
  "porfis",
  "porfa",
  "dnd",
  "dsp",
  "msj",
  "msg",
  "lol",
  "omg",
  "btw",
  "idk",
  "imo",
  "imho",
  "fyi",
  "asap",
  "ty",
  "thx",
  "pls",
  "plz",
  "rn",
  "nvm",
  "brb",
  "gtg",
  "gonna",
  "wanna",
  "gotta",
  "ml",
  "ai",
  "llm",
  "gpt",
  "claude",
  "openai",
  "anthropic",
  "prompt",
  "token",
  "embedding",
  "rag",
  "vector",
  "pinecone",
  "weaviate",
  "transformer",
  "attention",
  "encoder",
  "decoder",
  "bert",
  "roberta",
  "finetune",
  "pretrain",
  "hyperparameter",
  "batch",
  "epoch",
  "learning",
  "gradient",
  "optimizer",
  "adam",
  "sgd",
  "rmsprop",
  "dropout",
  "relu",
  "softmax",
  "sigmoid",
  "tanh",
  "bias",
  "weight",
  "layer",
  "neural",
  "convolutional",
  "recurrent",
  "lstm",
  "gru",
  "rnn",
  "cnn",
  "gan",
  "diffusion",
  "stable",
  "midjourney",
  "dall",
  "dalle",
  "huggingface",
  "langchain",
  "llamaindex",
  "chromadb",
  "faiss",
  "anyscale",
  "modal",
  "replicate",
  "cohere",
  "mistral",
  "meta",
  "google",
  "microsoft",
  "amazon",
  "azure",
  "aws",
  "gcp",
  "cloud",
  "serverless",
  "edge",
  "lambda",
  "vercel",
  "netlify",
  "render",
  "railway",
  "fly",
  "docker",
  "k8s",
  "kubernetes",
  "ci",
  "cd",
  "pr",
  "mr",
  "cr",
  "issue",
  "bug",
  "fix",
  "feat",
  "chore",
  "refactor",
  "test",
  "docs",
  "style",
  "perf",
  "build",
  "revert",
]);

// Common word completions for faster autocomplete
const COMMON_COMPLETIONS: Record<string, string[]> = {
  // Single-character completions (very common)
  i: ["is", "if", "in", "it", "into", "implement"],
  a: ["and", "are", "all", "about", "any", "also"],
  y: ["you", "your", "yes", "yet"],
  o: ["of", "or", "on", "one", "our"],
  // Spanish - very common
  hol: ["hola"],
  gra: ["gracias", "grande", "gratis"],
  bue: ["bueno", "buenas", "buenos", "buena"],
  com: ["como", "completar", "comenzar", "compartir"],
  qui: ["quiero", "quieres", "quizás", "quien"],
  est: ["este", "esta", "estoy", "estar", "estos", "estas"],
  por: ["porque", "por", "portal"],
  nec: ["necesito", "necesitas", "necesario", "necesaria"],
  pue: ["puede", "puedes", "puedo", "pueden"],
  ten: ["tengo", "tienes", "tenemos", "tener"],
  hac: ["hacer", "haciendo", "haces", "hace"],
  ent: ["entonces", "entiendo", "entre", "entrada"],
  per: ["pero", "persona", "permitir", "perfecto"],
  tod: ["todo", "todos", "toda", "todas", "todavía"],
  muc: ["mucho", "muchos", "mucha", "muchas"],
  aho: ["ahora", "ahorrar", "ahorro"],
  sie: ["siempre", "siendo", "siento"],
  nun: ["nunca"],
  tam: ["también", "tampoco"],
  sol: ["solo", "solamente", "solución"],
  cua: ["cuando", "cual", "cuales", "cuanto"],
  don: ["donde", "dónde"],
  alg: ["algo", "alguno", "alguna", "algunos"],
  nad: ["nada", "nadie"],
  mis: ["mismo", "misma", "mismos"],
  otr: ["otro", "otra", "otros", "otras"],
  pri: ["primero", "primera", "principal", "privado"],
  seg: ["segundo", "seguro", "seguir", "según"],
  ter: ["tercero", "terminar", "terminal"],
  // English - very common
  hel: ["hello", "help", "helpful"],
  tha: ["thanks", "thank", "that", "than"],
  wha: ["what", "whatever", "whats"],
  the: ["there", "these", "they", "them", "their", "then"],
  ple: ["please", "plenty"],
  wou: ["would", "wouldn't"],
  cou: ["could", "couldn't", "course"],
  sho: ["should", "shouldn't", "show"],
  nee: ["need", "needed", "needs"],
  wan: ["want", "wanted", "wants"],
  thi: ["this", "think", "thing", "things"],
  wor: ["work", "working", "works", "world"],
  jus: ["just"],
  rig: ["right"],
  kno: ["know", "known", "knowledge"],
  bec: ["because", "become", "became"],
  rea: ["really", "read", "ready", "reason"],
  mak: ["make", "making", "makes"],
  tak: ["take", "taking", "takes"],
  goo: ["good", "google"],
  gre: ["great", "green"],
  sor: ["sorry"],
  und: ["understand", "under"],
  pro: ["problem", "probably", "project", "provide"],
  dif: ["different", "difficult"],
  imp: ["important", "improve", "import"],
  int: ["into", "interesting", "information"],
  act: ["actually", "action", "active"],
};

// Common phrase completions - triggered after specific words (sentence prediction)
const PHRASE_COMPLETIONS: Record<string, string[]> = {
  // Spanish phrases - general
  muchas: ["gracias"],
  por: ["favor", "cierto", "ejemplo", "supuesto", "qué"],
  sin: ["embargo", "duda"],
  tal: ["vez", "cual"],
  de: ["hecho", "acuerdo", "todas formas", "todos modos", "nada"],
  en: ["realidad", "serio", "efecto", "fin", "cambio"],
  a: ["veces", "pesar de", "través de", "menos que"],
  lo: ["siento", "que", "mejor", "peor", "mismo"],
  me: ["parece", "gusta", "gustaría", "pregunto"],
  te: ["agradezco", "recomiendo", "sugiero"],
  no: ["obstante", "hay problema", "te preocupes", "importa", "sé"],
  qué: ["tal", "pasa", "piensas", "opinas", "quieres"],
  cómo: ["estás", "te va", "puedo ayudar"],
  buenos: ["días", "tardes"],
  buenas: ["noches", "tardes"],
  hasta: ["luego", "pronto", "mañana"],
  un: ["momento", "segundo", "placer"],
  con: ["mucho gusto", "respecto a", "permiso"],
  // Spanish phrases - programming/tech
  implementar: ["una función", "el sistema", "la solución", "esta funcionalidad"],
  crear: ["una función", "un componente", "una clase", "un archivo"],
  agregar: ["una función", "un método", "un campo", "una propiedad"],
  añadir: ["una función", "un componente", "validación", "un test"],
  modificar: ["el código", "la función", "el componente", "el archivo"],
  arreglar: ["el error", "el bug", "el problema", "esto"],
  corregir: ["el error", "el código", "el problema", "esto"],
  eliminar: ["este código", "la función", "el componente", "el archivo"],
  refactorizar: ["el código", "la función", "el componente", "esto"],
  optimizar: ["el código", "la función", "el rendimiento", "esto"],
  podemos: ["implementar", "crear", "agregar", "modificar", "usar"],
  puedes: ["implementar", "crear", "agregar", "ayudarme", "explicar"],
  necesito: ["implementar", "crear", "ayuda con", "saber cómo"],
  quiero: ["implementar", "crear", "agregar", "saber cómo"],
  como: ["podemos", "puedo", "funciona", "se hace"],
  ayuda: ["con esto", "para implementar", "para crear", "por favor"],
  una: ["función", "variable", "clase", "solución", "forma de"],
  nuevo: ["componente", "archivo", "método", "campo"],
  nueva: ["función", "clase", "variable", "solución"],
  // English phrases
  thank: ["you", "you very much", "you so much"],
  thanks: ["a lot", "for your help", "for everything"],
  how: ["are you", "can I help", "do you", "does it work"],
  i: ["think", "believe", "would like", "need", "want", "am"],
  you: ["are", "can", "should", "might", "could"],
  it: ["is", "was", "will be", "seems", "looks like"],
  this: ["is", "looks", "seems", "should"],
  that: ["is", "was", "would be", "sounds"],
  what: ["do you", "is", "are", "about", "if"],
  can: ["you", "I", "we", "help"],
  could: ["you", "I", "we", "please"],
  would: ["you", "like", "be", "it"],
  please: ["let me know", "help me", "check", "send"],
  let: ["me know", "me check", "me see"],
  looking: ["forward to", "for"],
  as: ["soon as possible", "well", "far as I know"],
  for: ["example", "instance", "now", "the record"],
  on: ["the other hand", "top of that"],
  by: ["the way", "the time"],
  at: ["least", "the moment", "this point"],
  good: ["morning", "afternoon", "evening", "luck", "job"],
  nice: ["to meet you", "work", "job"],
  see: ["you", "you later", "you soon"],
  take: ["care", "your time"],
  have: ["a nice day", "a good one", "fun"],
};

// Next word predictions based on context (last 1-2 words)
const NEXT_WORD_PREDICTIONS: Record<string, string[]> = {
  // Spanish
  "el": ["problema", "sistema", "usuario", "archivo", "proyecto"],
  "la": ["solución", "respuesta", "aplicación", "función", "página"],
  "los": ["archivos", "datos", "usuarios", "resultados", "cambios"],
  "las": ["opciones", "funciones", "variables", "configuraciones"],
  "un": ["error", "problema", "momento", "archivo", "ejemplo"],
  "una": ["función", "variable", "solución", "opción", "pregunta"],
  "es": ["necesario", "importante", "posible", "correcto", "mejor"],
  "está": ["funcionando", "listo", "bien", "mal", "correcto"],
  "son": ["necesarios", "importantes", "correctos", "diferentes"],
  "hay": ["que", "un error", "algún problema", "varias opciones"],
  "se": ["puede", "debe", "necesita", "recomienda"],
  "puede": ["ser", "que", "hacer", "usar", "ayudar"],
  "debe": ["ser", "estar", "tener", "hacer", "incluir"],
  "quiero": ["que", "saber", "hacer", "ver", "agregar"],
  "necesito": ["ayuda", "saber", "que", "hacer", "ver"],
  "puedo": ["hacer", "ver", "ayudar", "preguntar", "usar"],
  "cómo": ["puedo", "funciona", "se hace", "hago", "usar"],
  "qué": ["es", "significa", "pasa", "hace", "puedo"],
  "dónde": ["está", "puedo", "se encuentra", "queda"],
  "cuándo": ["se", "puedo", "es", "será", "fue"],
  "para": ["que", "poder", "hacer", "ver", "usar"],
  "si": ["es posible", "puedes", "quieres", "necesitas", "hay"],
  // English
  "the": ["problem", "solution", "file", "function", "user"],
  "a": ["problem", "solution", "function", "file", "new"],
  "an": ["error", "issue", "example", "option", "update"],
  "is": ["not", "working", "correct", "needed", "possible"],
  "are": ["you", "there", "they", "not", "working"],
  "i": ["need", "want", "think", "have", "am"],
  "you": ["can", "should", "need", "want", "have"],
  "we": ["can", "should", "need", "have", "will"],
  "it": ["is", "was", "will", "should", "can"],
  "this": ["is", "should", "will", "can", "needs"],
  "that": ["is", "was", "should", "can", "will"],
  "there": ["is", "are", "was", "were", "should"],
  "can": ["you", "i", "we", "be", "help"],
  "could": ["you", "i", "we", "be", "help"],
  "would": ["you", "like", "be", "it", "this"],
  "should": ["be", "i", "we", "you", "work"],
  "have": ["you", "a", "to", "been", "any"],
  "do": ["you", "not", "i", "we", "this"],
  "does": ["it", "this", "not", "the", "anyone"],
  "what": ["is", "are", "do", "does", "if"],
  "how": ["do", "can", "to", "does", "is"],
  "why": ["is", "do", "does", "are", "not"],
  "when": ["i", "you", "the", "will", "is"],
  "where": ["is", "are", "do", "can", "does"],
  "please": ["help", "check", "let", "send", "try"],
  "help": ["me", "with", "please", "you", "us"],
  "need": ["to", "help", "a", "some", "your"],
  "want": ["to", "a", "some", "you", "this"],
};

export function useSpellCheck(
  text: string,
  cursorPosition?: number | null,
): SpellCheckResult {
  const [state, setState] = useState<{
    isLoaded: boolean;
    error: string | null;
  }>({
    isLoaded: false,
    error: null,
  });

  const spellcheckersRef = useRef<{ en?: Typo; es?: Typo }>({});
  const loadAttemptedRef = useRef(false);

  // Load dictionaries on mount
  useEffect(() => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;

    const loadDictionaries = async () => {
      try {
        const baseUrl = getBaseUrl();
        console.log(
          "[SpellCheck] Loading dictionaries from:",
          baseUrl || "(relative)",
        );

        const buildUrl = (file: string) =>
          baseUrl ? `${baseUrl}/dictionaries/${file}` : `/dictionaries/${file}`;

        const fetchFile = async (url: string): Promise<string> => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status}`);
          }
          return response.text();
        };

        const [enAff, enDic, esAff, esDic] = await Promise.all([
          fetchFile(buildUrl("en_US.aff")),
          fetchFile(buildUrl("en_US.dic")),
          fetchFile(buildUrl("es_ES.aff")),
          fetchFile(buildUrl("es_ES.dic")),
        ]);

        console.log("[SpellCheck] Initializing Typo.js...");

        spellcheckersRef.current = {
          en: new Typo("en_US", enAff, enDic),
          es: new Typo("es_ES", esAff, esDic),
        };

        setState({ isLoaded: true, error: null });
        console.log("[SpellCheck] Dictionaries loaded successfully");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[SpellCheck] Failed to load dictionaries:", errorMsg);
        setState({ isLoaded: false, error: errorMsg });
      }
    };

    loadDictionaries();
  }, []);

  const analyzeText = useCallback(
    (inputText: string, cursorPosition: number) => {
      const { en, es } = spellcheckersRef.current;
      if (!en || !es) {
        return {
          misspelledWords: [],
          autocomplete: null,
          currentWordCorrection: null as {
            startIndex: number;
            endIndex: number;
            bestSuggestion: string;
          } | null,
        };
      }

      const misspelledWords: MisspelledWord[] = [];
      let autocomplete: AutocompleteSuggestion | null = null;
      let currentWordCorrection: {
        startIndex: number;
        endIndex: number;
        bestSuggestion: string;
      } | null = null;

      const wordRegex = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+/g;
      let match: RegExpExecArray | null;

      const clampedCursor = Math.max(
        0,
        Math.min(cursorPosition, inputText.length),
      );
      const beforeCursor = inputText.slice(0, clampedCursor);
      const currentWordMatch = beforeCursor.match(/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+$/i);
      const currentWordStart = currentWordMatch
        ? clampedCursor - currentWordMatch[0].length
        : -1;

      while ((match = wordRegex.exec(inputText)) !== null) {
        const word = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + word.length;
        const lowerWord = word.toLowerCase();

        if (word.length < 1) continue;
        if (IGNORE_WORDS.has(lowerWord)) continue;
        if (word === word.toUpperCase() && word.length > 1) continue;
        if (/[A-Z]/.test(word.slice(1)) && /[a-z]/.test(word)) continue;
        if (/\d/.test(word)) continue;

        const isCurrentWord =
          startIndex === currentWordStart && endIndex === clampedCursor;

        const isCorrectEn = en.check(word);
        const isCorrectEs = es.check(word);
        const isCorrectEnLower = en.check(lowerWord);
        const isCorrectEsLower = es.check(lowerWord);
        const isCorrect =
          isCorrectEn || isCorrectEs || isCorrectEnLower || isCorrectEsLower;

        if (isCurrentWord && word.length >= 1) {
          for (const [prefix, completions] of Object.entries(
            COMMON_COMPLETIONS,
          )) {
            if (
              lowerWord.startsWith(prefix) &&
              lowerWord.length >= prefix.length
            ) {
              const matchingCompletion = completions.find(
                (c) =>
                  c.toLowerCase().startsWith(lowerWord) &&
                  c.length > word.length,
              );
              if (matchingCompletion) {
                const completion =
                  word[0] === word[0].toUpperCase()
                    ? matchingCompletion.charAt(0).toUpperCase() +
                      matchingCompletion.slice(1)
                    : matchingCompletion;

                autocomplete = {
                  original: word,
                  completion,
                  remainingText: completion.slice(word.length),
                  startIndex,
                  endIndex,
                };
                break;
              }
            }
          }

          if (!autocomplete && !isCorrect && word.length >= 3) {
            const suggestionsEs = es.suggest(word, 5) || [];
            const suggestionsEn = en.suggest(word, 5) || [];
            const allSuggestions = [...suggestionsEs, ...suggestionsEn];

            const completionSuggestion = allSuggestions.find(
              (s) =>
                s.toLowerCase().startsWith(lowerWord) && s.length > word.length,
            );

            if (completionSuggestion) {
              const completion =
                word[0] === word[0].toUpperCase()
                  ? completionSuggestion.charAt(0).toUpperCase() +
                    completionSuggestion.slice(1)
                  : completionSuggestion;

              autocomplete = {
                original: word,
                completion,
                remainingText: completion.slice(word.length),
                startIndex,
                endIndex,
              };
            }
          }
        }

        if (!isCorrect && isCurrentWord) {
          const suggestionsEs = es.suggest(word, 3) || [];
          const suggestionsEn = en.suggest(word, 3) || [];
          const allSuggestions = [
            ...new Set([...suggestionsEs, ...suggestionsEn]),
          ].slice(0, 5);

          let bestSuggestion: string | null = null;
          if (allSuggestions.length > 0) {
            const scored = allSuggestions.map((s) => {
              let score = 0;
              const sLower = s.toLowerCase();

              if (sLower[0] === lowerWord[0]) score += 10;
              score -= Math.abs(s.length - word.length) * 2;
              if (suggestionsEs.includes(s)) score += 2;

              return { suggestion: s, score };
            });

            scored.sort((a, b) => b.score - a.score);
            bestSuggestion = scored[0]?.suggestion || null;

            if (bestSuggestion && word[0] === word[0].toUpperCase()) {
              bestSuggestion =
                bestSuggestion.charAt(0).toUpperCase() +
                bestSuggestion.slice(1);
            }
          }

          if (bestSuggestion) {
            currentWordCorrection = { startIndex, endIndex, bestSuggestion };
          }
        }

        if (!isCorrect && !isCurrentWord) {
          const suggestionsEs = es.suggest(word, 3) || [];
          const suggestionsEn = en.suggest(word, 3) || [];
          const allSuggestions = [
            ...new Set([...suggestionsEs, ...suggestionsEn]),
          ].slice(0, 5);

          let bestSuggestion: string | null = null;
          if (allSuggestions.length > 0) {
            const scored = allSuggestions.map((s) => {
              let score = 0;
              const sLower = s.toLowerCase();

              if (sLower[0] === lowerWord[0]) score += 10;
              score -= Math.abs(s.length - word.length) * 2;
              if (suggestionsEs.includes(s)) score += 2;

              return { suggestion: s, score };
            });

            scored.sort((a, b) => b.score - a.score);
            bestSuggestion = scored[0]?.suggestion || null;

            if (bestSuggestion && word[0] === word[0].toUpperCase()) {
              bestSuggestion =
                bestSuggestion.charAt(0).toUpperCase() +
                bestSuggestion.slice(1);
            }
          }

          misspelledWords.push({
            word,
            startIndex,
            endIndex,
            suggestions: allSuggestions,
            bestSuggestion,
          });
        }
      }

      // === PHRASE/NEXT-WORD PREDICTION ===
      // If no autocomplete yet and cursor is after a complete word (ends with space or at end)
      if (!autocomplete) {
        const charAtCursor = inputText[clampedCursor - 1];
        const isAfterSpace = charAtCursor === " " || charAtCursor === "\n";

        if (isAfterSpace || clampedCursor === inputText.length) {
          // Get the last 1-2 words before cursor for context
          const textBeforeCursor = beforeCursor.trimEnd();
          const words = textBeforeCursor.split(/\s+/);
          const lastWord = words[words.length - 1]?.toLowerCase() || "";
          const secondLastWord = words[words.length - 2]?.toLowerCase() || "";

          // Try phrase completions first (multi-word predictions)
          if (lastWord && PHRASE_COMPLETIONS[lastWord]) {
            const phraseOptions = PHRASE_COMPLETIONS[lastWord];
            if (phraseOptions.length > 0) {
              const suggestion = phraseOptions[0];
              // Only suggest if cursor is right after the trigger word + space
              if (isAfterSpace) {
                autocomplete = {
                  original: "",
                  completion: suggestion,
                  remainingText: suggestion,
                  startIndex: clampedCursor,
                  endIndex: clampedCursor,
                };
              }
            }
          }

          // Try next-word predictions if no phrase completion
          if (!autocomplete && lastWord && NEXT_WORD_PREDICTIONS[lastWord]) {
            const nextOptions = NEXT_WORD_PREDICTIONS[lastWord];
            if (nextOptions.length > 0 && isAfterSpace) {
              const suggestion = nextOptions[0];
              autocomplete = {
                original: "",
                completion: suggestion,
                remainingText: suggestion,
                startIndex: clampedCursor,
                endIndex: clampedCursor,
              };
            }
          }

          // Try two-word context for better predictions
          if (!autocomplete && secondLastWord && lastWord) {
            const twoWordKey = `${secondLastWord} ${lastWord}`;
            // Common two-word patterns
            const twoWordPhrases: Record<string, string> = {
              "por favor": "ayúdame",
              "muchas gracias": "por tu ayuda",
              "de acuerdo": "con eso",
              "thank you": "very much",
              "i would": "like to",
              "could you": "please",
              "how can": "I help",
              "let me": "know",
              "looking forward": "to",
              "as soon": "as possible",
            };

            if (twoWordPhrases[twoWordKey] && isAfterSpace) {
              autocomplete = {
                original: "",
                completion: twoWordPhrases[twoWordKey],
                remainingText: twoWordPhrases[twoWordKey],
                startIndex: clampedCursor,
                endIndex: clampedCursor,
              };
            }
          }
        }
      }

      return { misspelledWords, autocomplete, currentWordCorrection };
    },
    [],
  );

  // Analyze the text and find all misspelled words
  const analysisResult = useMemo(() => {
    if (!state.isLoaded || !text.trim()) {
      return { misspelledWords: [], autocomplete: null };
    }

    return analyzeText(text, cursorPosition ?? text.length);
  }, [text, state.isLoaded, analyzeText, cursorPosition]);

  // Function to get the corrected text
  const getCorrectedText = useCallback((): string => {
    if (analysisResult.misspelledWords.length === 0) {
      return text;
    }

    // Apply corrections from end to start to preserve indices
    let correctedText = text;
    const sortedWords = [...analysisResult.misspelledWords].sort(
      (a, b) => b.startIndex - a.startIndex,
    );

    for (const misspelled of sortedWords) {
      if (misspelled.bestSuggestion) {
        correctedText =
          correctedText.slice(0, misspelled.startIndex) +
          misspelled.bestSuggestion +
          correctedText.slice(misspelled.endIndex);
      }
    }

    return correctedText;
  }, [text, analysisResult.misspelledWords]);

  // Apply all corrections
  const applyAllCorrections = useCallback((): string => {
    return getCorrectedText();
  }, [getCorrectedText]);

  // Apply autocomplete
  const applyAutocomplete = useCallback((): string | null => {
    if (!analysisResult.autocomplete) return null;

    const { startIndex, endIndex, completion } = analysisResult.autocomplete;
    return text.slice(0, startIndex) + completion + text.slice(endIndex);
  }, [text, analysisResult.autocomplete]);

  const applyTab = useCallback(
    (
      cursorPosition?: number | null,
    ): { text: string; cursorPosition: number | null } => {
      const clampedCursor = Math.max(
        0,
        Math.min(cursorPosition ?? text.length, text.length),
      );
      if (!state.isLoaded || !text.trim()) {
        return { text, cursorPosition: clampedCursor };
      }

      const { en, es } = spellcheckersRef.current;
      if (!en || !es) {
        return { text, cursorPosition: clampedCursor };
      }

      const firstPass = analyzeText(text, clampedCursor);
      const allCorrections = [...firstPass.misspelledWords];
      if (!firstPass.autocomplete && firstPass.currentWordCorrection) {
        allCorrections.push({
          word: text.slice(
            firstPass.currentWordCorrection.startIndex,
            firstPass.currentWordCorrection.endIndex,
          ),
          startIndex: firstPass.currentWordCorrection.startIndex,
          endIndex: firstPass.currentWordCorrection.endIndex,
          suggestions: [],
          bestSuggestion: firstPass.currentWordCorrection.bestSuggestion,
        });
      }
      const sortedWords = allCorrections.sort(
        (a, b) => b.startIndex - a.startIndex,
      );

      let correctedText = text;
      let newCursor = clampedCursor;

      for (const misspelled of sortedWords) {
        if (!misspelled.bestSuggestion) continue;

        const originalLen = misspelled.endIndex - misspelled.startIndex;
        const replacementLen = misspelled.bestSuggestion.length;
        const delta = replacementLen - originalLen;

        if (newCursor > misspelled.endIndex) {
          newCursor += delta;
        } else if (
          newCursor >= misspelled.startIndex &&
          newCursor <= misspelled.endIndex
        ) {
          newCursor = misspelled.startIndex + replacementLen;
        }

        correctedText =
          correctedText.slice(0, misspelled.startIndex) +
          misspelled.bestSuggestion +
          correctedText.slice(misspelled.endIndex);
      }

      const secondPass = analyzeText(correctedText, newCursor);
      if (!secondPass.autocomplete) {
        return { text: correctedText, cursorPosition: newCursor };
      }

      const { startIndex, endIndex, completion } = secondPass.autocomplete;
      const inserted = completion.length - (endIndex - startIndex);

      if (newCursor >= startIndex && newCursor <= endIndex) {
        newCursor = startIndex + completion.length;
      } else if (newCursor > endIndex) {
        newCursor += inserted;
      }

      const finalText =
        correctedText.slice(0, startIndex) +
        completion +
        correctedText.slice(endIndex);
      return { text: finalText, cursorPosition: newCursor };
    },
    [analyzeText, state.isLoaded, text],
  );

  // Auto-correct the word that just ended when space is pressed
  const autoCorrectOnSpace = useCallback(
    (
      inputText: string,
      cursorPos: number,
    ): { text: string; cursorPosition: number; corrected: boolean } | null => {
      if (!state.isLoaded) return null;

      const { en, es } = spellcheckersRef.current;
      if (!en || !es) return null;

      // Find the word that just ended (before the space that will be inserted)
      const beforeCursor = inputText.slice(0, cursorPos);
      const wordMatch = beforeCursor.match(/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+$/i);

      if (!wordMatch) return null;

      const word = wordMatch[0];
      const wordStart = cursorPos - word.length;
      const lowerWord = word.toLowerCase();

      // Skip if word is too short or in ignore list
      if (word.length < 2) return null;
      if (IGNORE_WORDS.has(lowerWord)) return null;
      if (word === word.toUpperCase() && word.length > 1) return null;

      // Check if word is correctly spelled
      const isCorrect =
        en.check(word) ||
        es.check(word) ||
        en.check(lowerWord) ||
        es.check(lowerWord);

      if (isCorrect) return null;

      // Get suggestions and find best one
      const suggestionsEs = es.suggest(word, 3) || [];
      const suggestionsEn = en.suggest(word, 3) || [];
      const allSuggestions = [
        ...new Set([...suggestionsEs, ...suggestionsEn]),
      ].slice(0, 5);

      if (allSuggestions.length === 0) return null;

      // Score suggestions
      const scored = allSuggestions.map((s) => {
        let score = 0;
        const sLower = s.toLowerCase();

        // Prefer suggestions that start with same letter
        if (sLower[0] === lowerWord[0]) score += 10;
        // Prefer similar length
        score -= Math.abs(s.length - word.length) * 2;
        // Prefer Spanish suggestions slightly
        if (suggestionsEs.includes(s)) score += 2;

        return { suggestion: s, score };
      });

      scored.sort((a, b) => b.score - a.score);
      let bestSuggestion = scored[0]?.suggestion || null;

      if (!bestSuggestion) return null;

      // Preserve capitalization
      if (word[0] === word[0].toUpperCase()) {
        bestSuggestion =
          bestSuggestion.charAt(0).toUpperCase() + bestSuggestion.slice(1);
      }

      // Apply correction
      const correctedText =
        inputText.slice(0, wordStart) +
        bestSuggestion +
        inputText.slice(cursorPos);

      const delta = bestSuggestion.length - word.length;

      return {
        text: correctedText,
        cursorPosition: cursorPos + delta,
        corrected: true,
      };
    },
    [state.isLoaded],
  );

  return {
    misspelledWords: analysisResult.misspelledWords,
    autocomplete: analysisResult.autocomplete,
    isLoaded: state.isLoaded,
    error: state.error,
    applyAllCorrections,
    applyAutocomplete,
    applyTab,
    getCorrectedText,
    autoCorrectOnSpace,
  };
}
