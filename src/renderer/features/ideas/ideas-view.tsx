/**
 * Ideas View - Block-based note editor with AI capabilities
 *
 * Uses BlockNote with xl-ai extension for complete AI integration:
 * - Custom AI Menu with proper streamTools configuration
 * - Text corrections REPLACE selected text (don't add below)
 * - Content generation ADDS new content
 * - PDF export
 * - Integration with GPT-5-mini (OpenAI) or GLM-4-Plus (Z.AI)
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
  AIMenu,
} from "@blocknote/xl-ai";
import { en as aiEn } from "@blocknote/xl-ai/locales";
import "@blocknote/xl-ai/style.css";

import { DefaultChatTransport } from "ai";
import { PartialBlock } from "@blocknote/core";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from "@blocknote/xl-pdf-exporter";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { currentProviderAtom } from "@/lib/atoms";
import { useAtom } from "jotai";
import { trpc } from "@/lib/trpc";
import { getCustomAIMenuItems } from "./custom-ai-menu";
import {
  RiSparklingLine,
  RiArrowDownSLine,
  RiFilePdf2Line,
} from "react-icons/ri";

const STORAGE_KEY = "ideas-content";

// Available AI models
const AI_MODELS = {
  openai: [
    { id: "gpt-5-mini", name: "GPT-5 Mini", description: "Fast & capable" },
    { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Ultra fast" },
  ],
  zai: [{ id: "GLM-4.7-Flash", name: "GLM-4.7 Flash", description: "Fast" }],
};

interface IdeasEditorProps {
  initialContent: PartialBlock[];
  isDark: boolean;
  aiServerPort: number;
  modelId: string;
  onEditorReady: (editor: BlockNoteEditor<any, any, any>) => void;
}

// Custom AI Menu that uses our streamTools configuration
function CustomAIMenu() {
  return (
    <AIMenu
      items={(editor, aiResponseStatus) =>
        getCustomAIMenuItems(editor, aiResponseStatus)
      }
    />
  );
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
function SuggestionMenuWithAI({
  editor,
}: {
  editor: BlockNoteEditor<any, any, any>;
}) {
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          [
            ...getDefaultReactSlashMenuItems(editor),
            ...getAISlashMenuItems(editor),
          ],
          query,
        )
      }
    />
  );
}

/**
 * Custom fetch function that adds provider/model headers to requests
 */
function createAIFetch(provider: string, modelId: string) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("X-AI-Provider", provider);
    headers.set("X-AI-Model", modelId);

    return globalThis.fetch(input, {
      ...init,
      headers,
    });
  };
}

const IdeasEditor = ({
  initialContent,
  isDark,
  aiServerPort,
  modelId,
  onEditorReady,
}: IdeasEditorProps) => {
  const [provider] = useAtom(currentProviderAtom);

  // Get API key status from settings
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  // Memoize the transport to avoid recreating on every render
  const aiTransport = useMemo(() => {
    if (aiServerPort <= 0) return undefined;

    return new DefaultChatTransport({
      api: `http://127.0.0.1:${aiServerPort}/ai/streamText`,
      fetch: createAIFetch(provider, modelId),
    });
  }, [aiServerPort, provider, modelId]);

  // Create editor with AI extension
  const editor = useCreateBlockNote(
    {
      dictionary: {
        ...en,
        ai: aiEn,
      },
      extensions: aiTransport
        ? [
            AIExtension({
              transport: aiTransport,
              agentCursor: {
                name: "AI",
                color: "#8b5cf6",
              },
            }),
          ]
        : [],
      initialContent,
      uploadFile: async (file: File) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });
      },
    },
    [aiTransport],
  );

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

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
          <h3 className="text-lg font-semibold text-foreground mb-2">
            API Key Required
          </h3>
          <p className="text-sm">
            Configure an OpenAI or Z.AI API key in Settings to enable AI
            features.
          </p>
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
        <AIMenuController aiMenu={CustomAIMenu} />
        <FormattingToolbarWithAI />
        <SuggestionMenuWithAI editor={editor} />
      </BlockNoteView>
    </div>
  );
};

export const IdeasView = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [initialContent, setInitialContent] = useState<PartialBlock[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [aiServerPort, setAiServerPort] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>("gpt-5-mini");
  const editorRef = useRef<BlockNoteEditor<any, any, any> | null>(null);
  const [provider, setProvider] = useAtom(currentProviderAtom);

  // Get available models for current provider
  const availableModels = useMemo(() => {
    return provider === "zai" ? AI_MODELS.zai : AI_MODELS.openai;
  }, [provider]);

  // Get current model info
  const currentModel = useMemo(() => {
    return (
      availableModels.find((m) => m.id === selectedModelId) ||
      availableModels[0]
    );
  }, [availableModels, selectedModelId]);

  // Update selected model when provider changes
  useEffect(() => {
    const defaultModel = provider === "zai" ? "GLM-4.7-Flash" : "gpt-5-mini";
    setSelectedModelId(defaultModel);
  }, [provider]);

  const handleEditorReady = useCallback(
    (editor: BlockNoteEditor<any, any, any>) => {
      editorRef.current = editor;
    },
    [],
  );

  // Export to PDF function
  const handleExportPdf = useCallback(async () => {
    if (!editorRef.current || isExportingPdf) return;

    setIsExportingPdf(true);
    try {
      const exporter = new PDFExporter(
        editorRef.current.schema,
        pdfDefaultSchemaMappings,
      );
      const doc = await exporter.toReactPDFDocument(editorRef.current.document);
      const blob = await pdf(doc).toBlob();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `notes-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("[IdeasView] Error exporting PDF:", err);
    } finally {
      setIsExportingPdf(false);
    }
  }, [isExportingPdf]);

  const getDefaultContent = useCallback(
    (): PartialBlock[] => [
      { type: "heading", content: "Notes" },
      {
        type: "paragraph",
        content: "Capture your thoughts and ideas here.",
      },
      {
        type: "paragraph",
        content: "Type '/' for commands or select text for AI assistance.",
      },
    ],
    [],
  );

  useEffect(() => {
    const desktopApi = window.desktopApi as
      | { getAIServerPort?: () => Promise<number> }
      | undefined;
    desktopApi
      ?.getAIServerPort?.()
      .then((port: number) => {
        setAiServerPort(port);
      })
      .catch((err: Error) => {
        console.error("[IdeasView] Failed to get AI server port:", err);
      });

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
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (aiServerPort === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full w-full bg-background transition-colors duration-300 flex flex-col",
      )}
    >
      {/* Subtle inline toolbar - positioned below content header area */}
      <div className="flex items-center justify-end gap-1 px-6 py-1.5 border-b bg-muted/20">
        {/* Model selector dropdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
                >
                  <RiSparklingLine className="h-3 w-3 text-purple-500" />
                  <span className="max-w-[80px] truncate">
                    {currentModel.name}
                  </span>
                  <RiArrowDownSLine className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {availableModels.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                    className={cn(
                      "text-xs",
                      model.id === selectedModelId && "bg-accent",
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{model.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>AI Model</p>
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-3 bg-border" />

        {/* PDF export button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RiFilePdf2Line className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Export to PDF</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="w-full h-full min-h-[calc(100vh-60px)] py-4 px-6">
          {initialContent && (
            <IdeasEditor
              initialContent={initialContent}
              isDark={isDark}
              aiServerPort={aiServerPort}
              modelId={selectedModelId}
              onEditorReady={handleEditorReady}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default IdeasView;
