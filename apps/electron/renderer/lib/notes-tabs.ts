/**
 * System for managing open note pages as tabs (Notion-style)
 */

import type { NotePage } from "./notes-storage";

export interface OpenNoteTab {
  pageId: string;
  page: NotePage;
  order: number;
}

const STORAGE_KEY = "notes-open-tabs";

export function getOpenTabs(): OpenNoteTab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const tabs = JSON.parse(stored);
    // Sort by order
    return tabs.sort((a: OpenNoteTab, b: OpenNoteTab) => a.order - b.order);
  } catch {
    return [];
  }
}

export function addOpenTab(page: NotePage): void {
  const tabs = getOpenTabs();
  
  // Check if already open
  if (tabs.some((t) => t.pageId === page.id)) {
    return;
  }
  
  // Add new tab
  const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1;
  tabs.push({
    pageId: page.id,
    page,
    order: maxOrder + 1,
  });
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}

export function removeOpenTab(pageId: string): void {
  const tabs = getOpenTabs();
  const filtered = tabs.filter((t) => t.pageId !== pageId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function reorderTabs(pageIds: string[]): void {
  const tabs = getOpenTabs();
  const reordered = pageIds.map((pageId, index) => {
    const tab = tabs.find((t) => t.pageId === pageId);
    if (tab) {
      return { ...tab, order: index };
    }
    return null;
  }).filter((t): t is OpenNoteTab => t !== null);
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reordered));
}

export function updateTabPage(page: NotePage): void {
  const tabs = getOpenTabs();
  const index = tabs.findIndex((t) => t.pageId === page.id);
  if (index >= 0) {
    tabs[index].page = page;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }
}

/**
 * Replace the current active tab with a new page (for sub-page navigation)
 * This allows navigating to sub-pages without creating new tabs
 */
export function replaceCurrentTab(pageId: string, page: NotePage): void {
  const tabs = getOpenTabs();
  if (tabs.length === 0) {
    // If no tabs, just add it
    addOpenTab(page);
    return;
  }
  
  // Replace the last tab (most recent/active) with the new page
  const lastTabIndex = tabs.length - 1;
  tabs[lastTabIndex] = {
    pageId,
    page,
    order: tabs[lastTabIndex].order,
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}
