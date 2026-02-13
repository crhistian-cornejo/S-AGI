/**
 * Type definitions for the Desktop API exposed to the renderer process.
 * This file provides comprehensive type documentation for all available IPC methods.
 */

import type { windowBridge } from "./bridges/window";
import type { appBridge, appNestedBridge } from "./bridges/app";
import type { authBridge } from "./bridges/auth";
import type { themeBridge } from "./bridges/theme";
import type { clipboardBridge } from "./bridges/clipboard";
import type { trayBridge } from "./bridges/tray";
import type { menuBridge } from "./bridges/menu";
import type {
  filesBridge,
  excelBridge,
  imagesBridge,
  pdfBridge,
  securityBridge,
} from "./bridges/files";
import type { preferencesBridge } from "./bridges/preferences";
import type { streamsBridge } from "./bridges/streams";
import type {
  quickPromptBridge,
  powerBridge,
  updateBridge,
  hapticBridge,
  artifactBridge,
  uiBridge,
  univerBridge,
} from "./bridges/misc";

/**
 * Complete Desktop API interface exposed via contextBridge.
 * Access in renderer via: window.desktopApi
 */
export interface DesktopApi {
  // Window controls
  minimize: typeof windowBridge.minimize;
  maximize: typeof windowBridge.maximize;
  close: typeof windowBridge.close;
  isMaximized: typeof windowBridge.isMaximized;
  getBounds: typeof windowBridge.getBounds;
  getMinimumSize: typeof windowBridge.getMinimumSize;
  getMaximumSize: typeof windowBridge.getMaximumSize;
  setBounds: typeof windowBridge.setBounds;
  setMinimumSize: typeof windowBridge.setMinimumSize;
  setMaximumSize: typeof windowBridge.setMaximumSize;
  setWindowButtonVisibility: typeof windowBridge.setWindowButtonVisibility;
  setZenModeVibrancy: typeof windowBridge.setZenModeVibrancy;
  onMaximizeChange: typeof windowBridge.onMaximizeChange;

  // App info
  getVersion: typeof appBridge.getVersion;
  showAbout: typeof appBridge.showAbout;
  platform: typeof appBridge.platform;
  getAIServerPort: typeof appBridge.getAIServerPort;

  // Auth
  setSession: typeof authBridge.setSession;
  onAuthCallback: typeof authBridge.onAuthCallback;
  onOAuthTokens: typeof authBridge.onOAuthTokens;
  onAuthRefreshing: typeof authBridge.onAuthRefreshing;
  onAuthError: typeof authBridge.onAuthError;

  // Theme
  getTheme: typeof themeBridge.getTheme;
  setTheme: typeof themeBridge.setTheme;

  // Haptic
  haptic: typeof hapticBridge.perform;

  // Streams
  onAIStreamEvent: typeof streamsBridge.onAIStreamEvent;
  onAgentPanelStream: typeof streamsBridge.onAgentPanelStream;
  onIdeasStream: typeof streamsBridge.onIdeasStream;
  onChatGPTConnected: typeof streamsBridge.onChatGPTConnected;
  onGeminiConnected: typeof streamsBridge.onGeminiConnected;

  // Artifact listeners
  onArtifactUpdate: typeof artifactBridge.onArtifactUpdate;
  onFileSaveWithAIMetadata: typeof artifactBridge.onFileSaveWithAIMetadata;
  onArtifactCreated: typeof artifactBridge.onArtifactCreated;

  // UI Navigation
  onNavigateTab: typeof uiBridge.onNavigateTab;
  onSelectArtifact: typeof uiBridge.onSelectArtifact;
  onNotification: typeof uiBridge.onNotification;

  // Univer cell highlighting
  highlightCells: typeof univerBridge.highlightCells;
  onHighlightCells: typeof univerBridge.onHighlightCells;

  // Nested namespaces
  tray: typeof trayBridge;
  app: typeof appNestedBridge;
  menu: typeof menuBridge;
  files: typeof filesBridge;
  excel: typeof excelBridge;
  images: typeof imagesBridge;
  pdf: typeof pdfBridge;
  security: typeof securityBridge;
  clipboard: typeof clipboardBridge;
  quickPrompt: typeof quickPromptBridge;
  power: typeof powerBridge;
  preferences: typeof preferencesBridge;
  update: typeof updateBridge;
}

/**
 * Note: Window interface augmentation is defined in index.d.ts
 * to avoid conflicts with the existing declaration.
 */
