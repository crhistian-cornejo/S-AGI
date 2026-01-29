// Re-export tRPC helpers from separate file to avoid circular imports
export { router, publicProcedure } from "./trpc";

// Import routers
import { router } from "./trpc";
import { chatsRouter } from "./routers/chats";
import { messagesRouter } from "./routers/messages";
import { artifactsRouter } from "./routers/artifacts";
import { aiRouter } from "./routers/ai";
import { authRouter } from "./routers/auth";
import { settingsRouter } from "./routers/settings";
import { toolsRouter } from "./routers/tools";
import { filesRouter } from "./routers/files";
import { galleryRouter } from "./routers/gallery";
import { hotkeysRouter } from "./routers/hotkeys";
import { pdfRouter } from "./routers/pdf";
import { usageRouter } from "./routers/usage";
import { agentPanelRouter } from "./routers/agent-panel";
import { ideasRouter } from "./routers/ideas";
import { permissionsRouter } from "./routers/permissions";
import { panelMessagesRouter } from "./routers/panel-messages";
import { userFilesRouter } from "./routers/user-files";
import { aiProvidersRouter } from "./routers/ai-providers";
import { checkpointsRouter } from "./routers/checkpoints";

// Main app router
export const appRouter = router({
  chats: chatsRouter,
  messages: messagesRouter,
  artifacts: artifactsRouter,
  ai: aiRouter,
  auth: authRouter,
  settings: settingsRouter,
  tools: toolsRouter,
  files: filesRouter,
  gallery: galleryRouter,
  hotkeys: hotkeysRouter,
  pdf: pdfRouter,
  usage: usageRouter,
  agentPanel: agentPanelRouter,
  ideas: ideasRouter,
  permissions: permissionsRouter,
  panelMessages: panelMessagesRouter,
  userFiles: userFilesRouter,
  aiProviders: aiProvidersRouter,
  checkpoints: checkpointsRouter,
});

// Export type for client
export type AppRouter = typeof appRouter;
