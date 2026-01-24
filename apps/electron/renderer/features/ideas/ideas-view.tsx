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
import { NotesPageHeader } from "@/features/notes/notes-page-header";
import { 
  currentProviderAtom, 
  selectedNotePageIdAtom, 
  notePagesCacheAtom,
  notesSelectedModelIdAtom,
  notesEditorRefAtom,
  notesIsExportingPdfAtom,
} from "@/lib/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { trpc } from "@/lib/trpc";
import { getCustomAIMenuItems } from "./custom-ai-menu";
import { getPageById, savePage } from "@/lib/notes-storage";
import { updateTabPage } from "@/lib/notes-tabs";

interface IdeasEditorProps {
  initialContent: PartialBlock[];
  isDark: boolean;
  aiServerPort: number;
  modelId: string;
  onEditorReady: (editor: BlockNoteEditor<any, any, any>) => void;
  pageId?: string;
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
  pageId,
}: IdeasEditorProps & { pageId?: string }) => {
  const [provider] = useAtom(currentProviderAtom);
  const setNotePage = useSetAtom(notePagesCacheAtom);

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
  // IMPORTANT: Recreate editor when pageId changes to ensure independent content per page
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
    // Recreate editor when pageId or initialContent changes to ensure each page has independent content
    [aiTransport, pageId],
  );

  // Update editor content when initialContent changes (for same pageId)
  useEffect(() => {
    if (editor && pageId && initialContent && initialContent.length > 0) {
      try {
        // Replace all blocks with the new page content
        // This ensures each page maintains its own independent content
        const currentBlocks = editor.document;
        if (JSON.stringify(currentBlocks) !== JSON.stringify(initialContent)) {
          editor.replaceBlocks(editor.document, initialContent);
        }
      } catch (error) {
        console.error("[IdeasEditor] Error updating editor content:", error);
      }
    }
  }, [editor, initialContent, pageId]);

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Save to page storage on change
  // IMPORTANT: Each page saves its own independent content
  const handleOnChange = useCallback(() => {
    if (editor && pageId) {
      const blocks = editor.document;
      // Deep clone blocks to ensure independence
      const clonedBlocks = JSON.parse(JSON.stringify(blocks));
      
      const page = getPageById(pageId);
      if (page) {
        // Save independent content for this specific page
        page.content = clonedBlocks;
        page.updatedAt = Date.now();
        savePage(page);
        // Update cache and tabs with the saved page
        setNotePage((prev) => ({ ...prev, [pageId]: { ...page } }));
        updateTabPage(page);
      }
    }
  }, [editor, pageId, setNotePage]);

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
  const [selectedPageId] = useAtom(selectedNotePageIdAtom);
  const pagesCache = useAtomValue(notePagesCacheAtom);
  const [initialContent, setInitialContent] = useState<PartialBlock[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [aiServerPort, setAiServerPort] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useAtom(notesIsExportingPdfAtom);
  const [selectedModelId, setSelectedModelId] = useAtom(notesSelectedModelIdAtom);
  const editorRef = useRef<BlockNoteEditor<any, any, any> | null>(null);
  const setEditorRef = useSetAtom(notesEditorRefAtom);
  const [provider] = useAtom(currentProviderAtom);

  // Update selected model when provider changes
  useEffect(() => {
    const defaultModel = provider === "zai" ? "GLM-4.7-Flash" : "gpt-5-mini";
    setSelectedModelId(defaultModel);
  }, [provider, setSelectedModelId]);

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
  }, [isExportingPdf, setIsExportingPdf]);

  // Update editor ref atom when editor or export function changes
  useEffect(() => {
    if (editorRef.current) {
      setEditorRef({
        editor: editorRef.current,
        exportPdf: handleExportPdf,
      });
    }
  }, [handleExportPdf, setEditorRef]);

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

  const setNotePage = useSetAtom(notePagesCacheAtom);

  // Load page content when selected page changes
  useEffect(() => {
    setIsLoading(true);
    if (selectedPageId) {
      // Try to get from cache first
      let page = pagesCache[selectedPageId];
      if (!page) {
        // Load from storage
        const loadedPage = getPageById(selectedPageId);
        if (loadedPage) {
          page = loadedPage;
          // Update cache
          setNotePage((prev) => ({ ...prev, [selectedPageId]: loadedPage }));
        }
      }
      
      // Each page has its own independent content
      if (page?.content && Array.isArray(page.content) && page.content.length > 0) {
        // Deep clone to ensure independence - each page maintains its own content
        setInitialContent(JSON.parse(JSON.stringify(page.content)));
      } else {
        // New page - use default content
        setInitialContent(getDefaultContent());
      }
    } else {
      // No page selected, show default
      setInitialContent(getDefaultContent());
    }
    setIsLoading(false);
  }, [selectedPageId, pagesCache, getDefaultContent, setNotePage]);

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
  }, []);

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
      {/* Page Header */}
      {selectedPageId && <NotesPageHeader />}
      
      {/* Editor Content */}
      <ScrollArea className="flex-1 w-full">
        <div className="w-full max-w-4xl mx-auto h-full min-h-[calc(100vh-60px)] py-8 px-12">
          {initialContent && (
            <IdeasEditor
              initialContent={initialContent}
              isDark={isDark}
              aiServerPort={aiServerPort}
              modelId={selectedModelId}
              onEditorReady={handleEditorReady}
              pageId={selectedPageId || undefined}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default IdeasView;
