// Re-export tRPC helpers from separate file to avoid circular imports
export { router, publicProcedure } from "./trpc";

// Import routers
import { router } from "./trpc";
import { createLazyRouter } from "./lazy-router";

// Eager imports - lightweight routers that are cheap to load
import { chatsRouter } from "./routers/chats";
import { messagesRouter } from "./routers/messages";
import { artifactsRouter } from "./routers/artifacts";
import { authRouter } from "./routers/auth";
import { settingsRouter } from "./routers/settings";
import { filesRouter } from "./routers/files";
import { hotkeysRouter } from "./routers/hotkeys";
import { usageRouter } from "./routers/usage";
import { ideasRouter } from "./routers/ideas";
import { permissionsRouter } from "./routers/permissions";
import { panelMessagesRouter } from "./routers/panel-messages";
import { userFilesRouter } from "./routers/user-files";
import { aiProvidersRouter } from "./routers/ai-providers";
import { checkpointsRouter } from "./routers/checkpoints";
import { projectsRouter } from "./routers/projects";
import { sessionRouter } from "./routers/session";

// Lazy imports - heavy routers that significantly impact cold boot time
// These are loaded on-demand when first called, reducing startup by 200-500ms
//
// Type annotations are preserved via `import type` while implementations load lazily
// This maintains full type safety with zero runtime cost for types
import type { aiRouter as AiRouterType } from "./routers/ai";
import type { toolsRouter as ToolsRouterType } from "./routers/tools";
import type { galleryRouter as GalleryRouterType } from "./routers/gallery";
import type { pdfRouter as PdfRouterType } from "./routers/pdf";
import type { agentPanelRouter as AgentPanelRouterType } from "./routers/agent-panel";

const aiRouter = createLazyRouter<typeof AiRouterType>(
  "ai",
  () => import("./routers/ai")
);

const toolsRouter = createLazyRouter<typeof ToolsRouterType>(
  "tools",
  () => import("./routers/tools")
);

const galleryRouter = createLazyRouter<typeof GalleryRouterType>(
  "gallery",
  () => import("./routers/gallery")
);

const pdfRouter = createLazyRouter<typeof PdfRouterType>(
  "pdf",
  () => import("./routers/pdf")
);

const agentPanelRouter = createLazyRouter<typeof AgentPanelRouterType>(
  "agentPanel",
  () => import("./routers/agent-panel")
);

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
  projects: projectsRouter,
  session: sessionRouter,
});

// Export type for client
export type AppRouter = typeof appRouter;
