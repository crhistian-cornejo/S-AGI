import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { IconMenu2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useAtom, useSetAtom } from "jotai";
import {
  settingsModalOpenAtom,
  settingsActiveTabAtom,
  selectedChatIdAtom,
  activeTabAtom,
  sidebarOpenAtom,
  shortcutsDialogOpenAtom,
  commandKOpenAtom,
  selectedArtifactAtom,
  artifactPanelOpenAtom,
  agentPanelOpenAtom,
  notesSidebarOpenAtom,
  pdfSidebarOpenAtom,
  excelSidebarOpenAtom,
  docSidebarOpenAtom,
} from "@/lib/atoms";
import { trpc } from "@/lib/trpc";
import { cn, isMac, isMacOS } from "@/lib/utils";
import { useEffect, useState, useMemo } from "react";
import type { SettingsTab } from "@/lib/atoms";

// Helper function to format hotkey string into a single Kbd component
function formatHotkey(hotkey: string) {
  const isMac = isMacOS();
  // Split by + or space, but keep + as separator indicator
  const parts = hotkey.split(/\+|\s+/).filter(Boolean);

  // Format each part and join with +
  const formattedParts = parts.map((part) => {
    if (part.toLowerCase() === "ctrl") {
      return isMac ? "⌃" : "Ctrl";
    } else if (part.toLowerCase() === "cmd" || part.toLowerCase() === "meta") {
      return isMac ? "⌘" : "Ctrl";
    } else if (part.toLowerCase() === "alt" || part.toLowerCase() === "opt") {
      return isMac ? "⌥" : "Alt";
    } else if (part.toLowerCase() === "shift") {
      return isMac ? "⇧" : "Shift";
    } else if (
      part.toLowerCase() === "delete" ||
      part.toLowerCase() === "del"
    ) {
      return isMac ? "⌫" : "Del";
    } else if (part === "Esc") {
      return isMac ? "⎋" : "Esc";
    }
    return part;
  });

  // Join all parts with + separator
  const displayText = formattedParts.join("+");

  return <Kbd className="text-[10px] ml-auto">{displayText}</Kbd>;
}

export function HamburgerMenu() {
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const setShortcutsOpen = useSetAtom(shortcutsDialogOpenAtom);
  const setCommandKOpen = useSetAtom(commandKOpenAtom);

  const [selectedArtifact, setSelectedArtifact] = useAtom(selectedArtifactAtom);
  const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(
    artifactPanelOpenAtom,
  );
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);

  const [notesSidebarOpen, setNotesSidebarOpen] = useAtom(notesSidebarOpenAtom);
  const [pdfSidebarOpen, setPdfSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const [excelSidebarOpen, setExcelSidebarOpen] = useAtom(excelSidebarOpenAtom);
  const [docSidebarOpen, setDocSidebarOpen] = useAtom(docSidebarOpenAtom);

  const utils = trpc.useUtils();
  const signOut = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      window.desktopApi?.setSession(null);
      utils.auth.getSession.invalidate();
    },
  });

  const handleNewChat = () => {
    // Siempre asegurar que estamos en el tab de chat
    setActiveTab("chat");
    // Luego crear un nuevo chat
    setSelectedChatId(null);
  };

  const handleNewSpreadsheet = () => {
    setActiveTab("excel");
    setSelectedArtifact(null);
  };

  const handleNewDocument = () => {
    setActiveTab("doc");
    setSelectedArtifact(null);
  };

  const handleClose = () => {
    window.desktopApi?.close();
  };

  const handleQuit = () => {
    if (window.desktopApi?.quit) {
      window.desktopApi.quit();
    } else {
      window.desktopApi?.close();
    }
  };

  const toggleCurrentSidebar = () => {
    switch (activeTab) {
      case "chat":
        setSidebarOpen(!sidebarOpen);
        break;
      case "ideas":
        setNotesSidebarOpen(!notesSidebarOpen);
        break;
      case "pdf":
        setPdfSidebarOpen(!pdfSidebarOpen);
        break;
      case "excel":
        setExcelSidebarOpen(!excelSidebarOpen);
        break;
      case "doc":
        setDocSidebarOpen(!docSidebarOpen);
        break;
      default:
        setSidebarOpen(!sidebarOpen);
    }
  };

  // Handler to open settings with specific tab
  const handleOpenSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 no-drag mr-0 -ml-1 z-[100] relative cursor-pointer pointer-events-auto"
          type="button"
        >
          <IconMenu2 size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 z-[100]">
        {/* File Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>File</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onClick={handleNewChat}>
              New Chat
              {formatHotkey("Ctrl+N")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewSpreadsheet}>
              New Spreadsheet
              {formatHotkey("Ctrl+Shift+N")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewDocument}>
              New Document
              {formatHotkey("Ctrl+Alt+N")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Import Files...
              {formatHotkey("Ctrl+U")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Open PDF...
              {formatHotkey("Ctrl+O")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleOpenSettings("account")}>
              Settings...
              {formatHotkey("Ctrl+,")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleQuit}>
              Exit
              {formatHotkey("Ctrl+Q")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Edit Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Edit</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem onClick={() => document.execCommand("undo")}>
              Undo
              {formatHotkey("Ctrl+Z")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => document.execCommand("redo")}>
              Redo
              {formatHotkey("Ctrl+Y")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => document.execCommand("cut")}>
              Cut
              {formatHotkey("Ctrl+X")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => document.execCommand("copy")}>
              Copy
              {formatHotkey("Ctrl+C")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => document.execCommand("paste")}>
              Paste
              {formatHotkey("Ctrl+V")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => document.execCommand("delete")}>
              Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => document.execCommand("selectAll")}>
              Select All
              {formatHotkey("Ctrl+A")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* View Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onClick={() => window.location.reload()}>
              Reload
              {formatHotkey("Ctrl+R")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Force Reload
              {formatHotkey("Ctrl+Shift+R")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.desktopApi?.toggleDevTools?.()}
            >
              Toggle Developer Tools
              {formatHotkey("Ctrl+Shift+I")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                if (window.desktopApi?.isMaximized?.()) {
                  window.desktopApi?.unmaximize?.();
                } else {
                  window.desktopApi?.maximize?.();
                }
              }}
            >
              Toggle Full Screen
              {formatHotkey("F11")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleCurrentSidebar}>
              Toggle Sidebar
              {formatHotkey("Ctrl+\\")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
              Show Keyboard Shortcuts
              {formatHotkey("Shift+?")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Chat Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Chat</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem disabled>
              Stop Generation
              {formatHotkey("Esc")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Cycle Reasoning Effort
              {formatHotkey("Ctrl+Tab")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Clear Chat</DropdownMenuItem>
            <DropdownMenuItem disabled>Archive Chat</DropdownMenuItem>
            <DropdownMenuItem disabled>
              Delete Chat
              {formatHotkey("Ctrl+Delete")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Artifact Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Artifact</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem disabled>
              Save Artifact
              {formatHotkey("Ctrl+S")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Export as Excel...</DropdownMenuItem>
            <DropdownMenuItem disabled>Export Chart as PNG...</DropdownMenuItem>
            <DropdownMenuItem disabled>Export Chart as PDF...</DropdownMenuItem>
            <DropdownMenuItem disabled>
              Copy Chart to Clipboard
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Download PDF</DropdownMenuItem>
            <DropdownMenuItem disabled>Open PDF in Browser</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setArtifactPanelOpen(false)}
              disabled={!selectedArtifact}
            >
              Close Artifact Panel
              {formatHotkey("Esc")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* PDF Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>PDF</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem disabled>
              Save PDF with Annotations
              {formatHotkey("Ctrl+S")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Navigate to Page...
              {formatHotkey("Ctrl+G")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Highlight Selected Text
              {formatHotkey("Ctrl+H")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Zoom In
              {formatHotkey("Ctrl+=")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Zoom Out
              {formatHotkey("Ctrl+-")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Reset Zoom
              {formatHotkey("Ctrl+0")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Agent Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Agent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem
              onClick={() => setAgentPanelOpen(!agentPanelOpen)}
            >
              Toggle Agent Panel
              {formatHotkey("Ctrl+Shift+A")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Clear Agent History</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Go Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Go</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onClick={() => setActiveTab("chat")}>
              Go to Chat
              {formatHotkey("Ctrl+1")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveTab("excel")}>
              Go to Spreadsheet
              {formatHotkey("Ctrl+2")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveTab("doc")}>
              Go to Document
              {formatHotkey("Ctrl+3")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveTab("pdf")}>
              Go to PDF
              {formatHotkey("Ctrl+4")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveTab("ideas")}>
              Go to Ideas
              {formatHotkey("Ctrl+5")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActiveTab("gallery")}>
              Go to Gallery
              {formatHotkey("Ctrl+6")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCommandKOpen(true)}>
              Search / Command K{formatHotkey("Ctrl+K")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Settings Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Settings</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem onClick={() => handleOpenSettings("account")}>
              Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenSettings("appearance")}>
              Appearance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenSettings("api-keys")}>
              API Keys
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenSettings("advanced")}>
              Advanced
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenSettings("shortcuts")}>
              Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenSettings("usage")}>
              Usage
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Window Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Window</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem onClick={() => window.desktopApi?.minimize()}>
              Minimize
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.desktopApi?.maximize()}>
              Zoom
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClose}>
              Close
              {formatHotkey("Ctrl+W")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Help Menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Help</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
              Keyboard Shortcuts
              {formatHotkey("Shift+?")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Learn More</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
