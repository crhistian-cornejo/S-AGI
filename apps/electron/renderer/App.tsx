import { useEffect } from "react";
import { Provider as JotaiProvider, useSetAtom } from "jotai";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TRPCProvider, trpc } from "./lib/trpc";
import { TooltipProvider } from "./components/ui/tooltip";
import { MainLayout } from "./features/layout/main-layout";
import { SettingsDialog } from "./features/settings/settings-dialog";
import { AuthDialog, AuthGuard, OAuthCallbackHandler } from "./features/auth";
import { OnboardingGuard } from "./features/onboarding";
import { AboutDialog } from "./features/help/about-dialog";
import { VSCodeThemeProvider } from "./lib/themes";
import { appStore } from "./lib/stores/jotai-store";
import "@/features/univer/univer-tooltip-fix.css";
import {
  hasChatGPTPlusAtom,
  chatGPTPlusStatusAtom,
  hasGeminiAdvancedAtom,
  geminiAdvancedStatusAtom,
  selectedChatIdAtom,
  selectedArtifactAtom,
  artifactPanelOpenAtom,
  sidebarOpenAtom,
  activeTabAtom,
  pendingQuickPromptMessageAtom,
} from "./lib/atoms";
import { toast } from "sonner";

/**
 * Themed Toaster component
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  );
}

/**
 * Synchronize OAuth connection statuses to Jotai atoms on app load
 */
function ConnectionStatusSync() {
  const setHasChatGPTPlus = useSetAtom(hasChatGPTPlusAtom);
  const setChatGPTPlusStatus = useSetAtom(chatGPTPlusStatusAtom);
  const setHasGeminiAdvanced = useSetAtom(hasGeminiAdvancedAtom);
  const setGeminiAdvancedStatus = useSetAtom(geminiAdvancedStatusAtom);

  // Query connection statuses
  const { data: chatGPTStatus } = trpc.auth.getChatGPTStatus.useQuery();
  const { data: geminiStatus } = trpc.auth.getGeminiStatus.useQuery();

  // Sync ChatGPT Plus status
  useEffect(() => {
    if (chatGPTStatus) {
      setHasChatGPTPlus(chatGPTStatus.isConnected);
      setChatGPTPlusStatus({
        isConnected: chatGPTStatus.isConnected,
        email: chatGPTStatus.email ?? undefined,
        accountId: chatGPTStatus.accountId ?? undefined,
        connectedAt: chatGPTStatus.connectedAt ?? undefined,
      });
    }
  }, [chatGPTStatus, setHasChatGPTPlus, setChatGPTPlusStatus]);

  // Sync Gemini Advanced status
  useEffect(() => {
    if (geminiStatus) {
      setHasGeminiAdvanced(geminiStatus.isConnected);
      setGeminiAdvancedStatus({
        isConnected: geminiStatus.isConnected,
        email: geminiStatus.email ?? undefined,
        connectedAt: geminiStatus.connectedAt ?? undefined,
      });
    }
  }, [geminiStatus, setHasGeminiAdvanced, setGeminiAdvancedStatus]);

  return null;
}

/**
 * Artifact Created Handler - Auto-selects newly created artifacts (especially charts)
 * Opens the artifact panel to display the new artifact immediately
 */
function ArtifactCreatedHandler() {
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom);
  const utils = trpc.useUtils();

  useEffect(() => {
    const cleanup = window.desktopApi?.onArtifactCreated?.((data) => {
      console.log("[ArtifactCreated] New artifact created:", data);
      const id = data?.artifactId ?? data?.id;
      if (!id || typeof id !== "string") {
        console.warn(
          "[ArtifactCreated] Missing artifactId/id in event, skipping fetch:",
          data,
        );
        return;
      }

      // Fetch the full artifact data and select it (only when persisted in DB)
      utils.artifacts.get
        .fetch({ id })
        .then((artifact) => {
          if (artifact) {
            setSelectedArtifact(artifact);
            setArtifactPanelOpen(true);
            utils.artifacts.list.invalidate();
            utils.artifacts.listAll.invalidate();
            console.log(
              "[ArtifactCreated] Artifact selected and panel opened:",
              artifact.name,
            );
          }
        })
        .catch((err) => {
          console.error("[ArtifactCreated] Failed to fetch artifact:", err);
        });
    });

    return () => {
      cleanup?.();
    };
  }, [setSelectedArtifact, setArtifactPanelOpen, utils]);

  return null;
}

/**
 * Quick Prompt Handler - Creates a new chat from the floating Quick Prompt window
 * Sets pendingQuickPromptMessageAtom so ChatView can auto-send the message with AI response
 */
function QuickPromptHandler() {
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom);
  const setSidebarOpen = useSetAtom(sidebarOpenAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setPendingMessage = useSetAtom(pendingQuickPromptMessageAtom);
  const utils = trpc.useUtils();

  const createChat = trpc.chats.create.useMutation({
    onError: (error) => {
      toast.error("Failed to create chat: " + error.message);
    },
  });

  useEffect(() => {
    const cleanup = window.desktopApi?.quickPrompt?.onCreateChat(
      (message: string) => {
        console.log(
          "[QuickPrompt] Received message to create chat:",
          message.substring(0, 50) + "...",
        );

        createChat.mutate(
          { title: message.slice(0, 50) + (message.length > 50 ? "..." : "") },
          {
            onSuccess: (chat) => {
              // Invalidate chats list so sidebar refreshes
              utils.chats.list.invalidate();
              utils.chats.get.invalidate({ id: chat.id });

              // Set up UI state
              setSelectedChatId(chat.id);
              setSelectedArtifact(null);
              setArtifactPanelOpen(false);
              setSidebarOpen(true);
              setActiveTab("chat");

              // Set pending message - ChatView will auto-send this
              setPendingMessage(message);
              console.log(
                "[QuickPrompt] Chat created and pending message set:",
                chat.id,
              );
            },
          },
        );
      },
    );

    return () => {
      cleanup?.();
    };
  }, [
    createChat,
    setSelectedChatId,
    setSelectedArtifact,
    setArtifactPanelOpen,
    setSidebarOpen,
    setActiveTab,
    setPendingMessage,
    utils,
  ]);

  return null;
}

/**
 * Main App component with all providers
 */
export function App() {
  // Listen for auth callback from main process
  useEffect(() => {
    const cleanup = window.desktopApi?.onAuthCallback?.((_data) => {
      console.log("[Auth] Received callback with code");
      // Handle auth callback - will be processed by auth store
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <JotaiProvider store={appStore}>
      <VSCodeThemeProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCProvider>
            <ConnectionStatusSync />
            <ArtifactCreatedHandler />
            <QuickPromptHandler />
            <TooltipProvider delayDuration={50} skipDelayDuration={0}>
              <OAuthCallbackHandler />
              <div
                data-sagi-app
                className="h-screen w-screen bg-background text-foreground overflow-hidden"
                style={{ minWidth: "835px" }}
              >
                <AuthGuard>
                  <OnboardingGuard>
                    <MainLayout />
                  </OnboardingGuard>
                </AuthGuard>
              </div>
              <AuthDialog />
              <SettingsDialog />
              <AboutDialog />
              <ThemedToaster />
            </TooltipProvider>
          </TRPCProvider>
        </ThemeProvider>
      </VSCodeThemeProvider>
    </JotaiProvider>
  );
}
