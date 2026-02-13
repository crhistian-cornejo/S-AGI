import { contextBridge } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";

// Import all bridge modules
import { windowBridge } from "./bridges/window";
import { appBridge, appNestedBridge } from "./bridges/app";
import { authBridge } from "./bridges/auth";
import { themeBridge } from "./bridges/theme";
import { clipboardBridge } from "./bridges/clipboard";
import { trayBridge } from "./bridges/tray";
import { menuBridge } from "./bridges/menu";
import {
  filesBridge,
  excelBridge,
  imagesBridge,
  pdfBridge,
  securityBridge,
} from "./bridges/files";
import { preferencesBridge } from "./bridges/preferences";
import { streamsBridge } from "./bridges/streams";
import {
  quickPromptBridge,
  powerBridge,
  updateBridge,
  hapticBridge,
  artifactBridge,
  uiBridge,
  univerBridge,
} from "./bridges/misc";

// Expose tRPC
exposeElectronTRPC();

// Assemble the complete Desktop API
// Note: The structure must match the original API shape exactly for backward compatibility
const desktopApi = {
  // Window controls (flat)
  minimize: windowBridge.minimize,
  maximize: windowBridge.maximize,
  close: windowBridge.close,
  isMaximized: windowBridge.isMaximized,
  getBounds: windowBridge.getBounds,
  getMinimumSize: windowBridge.getMinimumSize,
  getMaximumSize: windowBridge.getMaximumSize,
  setBounds: windowBridge.setBounds,
  setMinimumSize: windowBridge.setMinimumSize,
  setMaximumSize: windowBridge.setMaximumSize,
  setWindowButtonVisibility: windowBridge.setWindowButtonVisibility,
  setZenModeVibrancy: windowBridge.setZenModeVibrancy,
  onMaximizeChange: windowBridge.onMaximizeChange,

  // App info (flat)
  getVersion: appBridge.getVersion,
  showAbout: appBridge.showAbout,
  platform: appBridge.platform,
  getAIServerPort: appBridge.getAIServerPort,

  // Auth (flat)
  setSession: authBridge.setSession,
  onAuthCallback: authBridge.onAuthCallback,
  onOAuthTokens: authBridge.onOAuthTokens,
  onAuthRefreshing: authBridge.onAuthRefreshing,
  onAuthError: authBridge.onAuthError,

  // Theme (flat)
  getTheme: themeBridge.getTheme,
  setTheme: themeBridge.setTheme,

  // Haptic (flat)
  haptic: hapticBridge.perform,

  // Streams (flat)
  onAIStreamEvent: streamsBridge.onAIStreamEvent,
  onAgentPanelStream: streamsBridge.onAgentPanelStream,
  onIdeasStream: streamsBridge.onIdeasStream,
  onChatGPTConnected: streamsBridge.onChatGPTConnected,
  onGeminiConnected: streamsBridge.onGeminiConnected,

  // Artifact listeners (flat)
  onArtifactUpdate: artifactBridge.onArtifactUpdate,
  onFileSaveWithAIMetadata: artifactBridge.onFileSaveWithAIMetadata,
  onArtifactCreated: artifactBridge.onArtifactCreated,

  // UI Navigation (flat)
  onNavigateTab: uiBridge.onNavigateTab,
  onSelectArtifact: uiBridge.onSelectArtifact,
  onNotification: uiBridge.onNotification,

  // Univer cell highlighting (flat)
  highlightCells: univerBridge.highlightCells,
  onHighlightCells: univerBridge.onHighlightCells,

  // Nested objects
  tray: trayBridge,
  app: appNestedBridge,
  menu: menuBridge,
  files: filesBridge,
  excel: excelBridge,
  images: imagesBridge,
  pdf: pdfBridge,
  security: securityBridge,
  clipboard: clipboardBridge,
  quickPrompt: quickPromptBridge,
  power: powerBridge,
  preferences: preferencesBridge,
  update: updateBridge,
};

// Expose to renderer process
contextBridge.exposeInMainWorld("desktopApi", desktopApi);

// Type declaration for renderer
export type DesktopApi = typeof desktopApi;
