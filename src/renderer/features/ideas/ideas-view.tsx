/**
 * Ideas View - Block-based note editor with AI capabilities
 * 
 * Uses BlockNote with xl-ai extension for complete AI integration:
 * - AI Menu via slash command or toolbar
 * - AI-powered text generation, editing, summarization
 * - Integration with GPT-5-mini (OpenAI) or GLM-4.7-Flash (Z.AI)
 * 
 * AI requests are routed through a local HTTP server in the main process
 * to avoid CSP restrictions and keep API keys secure.
 */

import { BlockNoteEditor } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/core/fonts/inter.css";
import { en } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { en as aiEn } from "@blocknote/xl-ai/locales";
import "@blocknote/xl-ai/style.css";

import { DefaultChatTransport } from "ai";
import { PartialBlock } from "@blocknote/core";
import { useCallback, useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { currentProviderAtom } from '@/lib/atoms';
import { useAtomValue } from "jotai";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "ideas-content";

interface IdeasEditorProps {
  initialContent: PartialBlock[];
  isDark: boolean;
  aiServerPort: number;
}

// Formatting toolbar with AI button
function FormattingToolbarWithAI() {
  return (
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          {...getFormattingToolbarItems()}
          <AIToolbarButton />
        </FormattingToolbar>
      )}
    />
  );
}

// Slash menu with AI options
function SuggestionMenuWithAI({ editor }: { editor: BlockNoteEditor<any, any, any> }) {
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          [
            ...getDefaultReactSlashMenuItems(editor),
            ...getAISlashMenuItems(editor),
          ],
          query
        )
      }
    />
  );
}

/**
 * Custom fetch function that adds provider/model headers to requests
 * This routes AI requests through our local HTTP server
 */
function createAIFetch(provider: string, modelId: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("X-AI-Provider", provider);
    headers.set("X-AI-Model", modelId);
    
    return globalThis.fetch(input, {
      ...init,
      headers,
    });
  };
}

const IdeasEditor = ({ initialContent, isDark, aiServerPort }: IdeasEditorProps) => {
  const provider = useAtomValue(currentProviderAtom);
  
  // Get API key status from settings
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();
  
  // Create transport for local AI server
  const aiTransport = useMemo(() => {
    if (aiServerPort === 0) return null;
    
    const modelId = provider === "zai" ? "GLM-4.7-Flash" : "gpt-5-mini";
    
    return new DefaultChatTransport({
      api: `http://127.0.0.1:${aiServerPort}/ai/streamText`,
      fetch: createAIFetch(provider, modelId),
    });
  }, [aiServerPort, provider]);

  // Create editor with AI extension
  const editor = useCreateBlockNote({
    dictionary: {
      ...en,
      ai: aiEn,
    },
    extensions: aiTransport ? [
      AIExtension({
        transport: aiTransport as any,
      }),
    ] : [],
    initialContent,
    uploadFile: async (file: File) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    },
  });

  // Save to localStorage on change
  const handleOnChange = useCallback(() => {
    if (editor) {
      const blocks = editor.document;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
    }
  }, [editor]);

  // Show message if no API key
  if (!keyStatus?.hasOpenAI && !keyStatus?.hasZai) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">API Key Required</h3>
          <p className="text-sm">Configure an OpenAI or Z.AI API key in Settings to enable AI features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <BlockNoteView
        editor={editor}
        theme={isDark ? "dark" : "light"}
        className="h-full"
        onChange={handleOnChange}
        formattingToolbar={false}
        slashMenu={false}
      >
        {/* AI Menu Controller */}
        <AIMenuController />

        {/* Custom Formatting Toolbar with AI Button */}
        <FormattingToolbarWithAI />

        {/* Custom Slash Menu with AI Options */}
        <SuggestionMenuWithAI editor={editor} />
      </BlockNoteView>
    </div>
  );
};

export const IdeasView = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [initialContent, setInitialContent] = useState<PartialBlock[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiServerPort, setAiServerPort] = useState<number>(0);

  const getDefaultContent = useCallback((): PartialBlock[] => [
    { type: "heading", content: "Notes" },
    { type: "paragraph", content: "Capture your thoughts, sparks, and creative ideas here." },
    { type: "paragraph", content: "Type '/' to open commands - try '/AI' for AI assistance!" }
  ], []);

  useEffect(() => {
    // Get AI server port from main process
    const desktopApi = window.desktopApi as { getAIServerPort?: () => Promise<number> } | undefined;
    desktopApi?.getAIServerPort?.().then((port: number) => {
      console.log("[IdeasView] AI Server port:", port);
      setAiServerPort(port);
    }).catch((err: Error) => {
      console.error("[IdeasView] Failed to get AI server port:", err);
    });

    // Load saved content
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setInitialContent(JSON.parse(saved));
      } catch {
        setInitialContent(getDefaultContent());
      }
    } else {
      setInitialContent(getDefaultContent());
    }
    setIsLoading(false);
  }, [getDefaultContent]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Wait for AI server port
  if (aiServerPort === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Connecting to AI server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full w-full bg-background transition-colors duration-300 flex flex-col",
    )}>
      <ScrollArea className="flex-1 w-full">
        <div className="w-full h-full min-h-[calc(100vh-60px)] py-4 px-6">
          {initialContent && (
            <IdeasEditor 
              initialContent={initialContent} 
              isDark={isDark}
              aiServerPort={aiServerPort}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default IdeasView;
