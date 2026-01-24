/**
 * Local storage system for notes (pages and spaces)
 * Uses localStorage for persistence
 */

import type { PartialBlock } from "@blocknote/core";

export interface NotePage {
  id: string;
  title: string;
  content: PartialBlock[];
  spaceId: string | null; // null = root level, string = belongs to space
  parentId: string | null; // null = root level, string = parent page id (for nested pages)
  icon?: string; // emoji or icon identifier
  coverImage?: string; // base64 or URL for cover image
  descriptionVisible?: boolean; // whether description/header is visible
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
}

export interface NoteSpace {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

const STORAGE_PREFIX = "notes-";
const PAGES_KEY = `${STORAGE_PREFIX}pages`;
const SPACES_KEY = `${STORAGE_PREFIX}spaces`;

// ============================================================================
// Pages Management
// ============================================================================

export function getAllPages(): NotePage[] {
  try {
    const stored = localStorage.getItem(PAGES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getPageById(id: string): NotePage | null {
  const pages = getAllPages();
  return pages.find((p) => p.id === id) || null;
}

export function getPagesBySpace(spaceId: string | null): NotePage[] {
  const pages = getAllPages();
  return pages.filter((p) => p.spaceId === spaceId && !p.archived);
}

export function getPagesByParent(parentId: string | null): NotePage[] {
  const pages = getAllPages();
  return pages.filter((p) => p.parentId === parentId && !p.archived);
}

export function savePage(page: NotePage): void {
  const pages = getAllPages();
  const index = pages.findIndex((p) => p.id === page.id);
  
  if (index >= 0) {
    pages[index] = page;
  } else {
    pages.push(page);
  }
  
  localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
}

export function deletePage(id: string): void {
  const pages = getAllPages();
  const filtered = pages.filter((p) => p.id !== id);
  localStorage.setItem(PAGES_KEY, JSON.stringify(filtered));
}

export function createPage(
  title: string,
  spaceId: string | null = null,
  parentId: string | null = null,
  icon?: string,
): NotePage {
  const now = Date.now();
  const page: NotePage = {
    id: `page-${now}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    content: [
      { type: "heading", content: title },
      {
        type: "paragraph",
        content: "Start writing...",
      },
    ],
    spaceId,
    parentId,
    icon,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
  };
  
  savePage(page);
  return page;
}

// ============================================================================
// Spaces Management
// ============================================================================

export function getAllSpaces(): NoteSpace[] {
  try {
    const stored = localStorage.getItem(SPACES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getSpaceById(id: string): NoteSpace | null {
  const spaces = getAllSpaces();
  return spaces.find((s) => s.id === id) || null;
}

export function saveSpace(space: NoteSpace): void {
  const spaces = getAllSpaces();
  const index = spaces.findIndex((s) => s.id === space.id);
  
  if (index >= 0) {
    spaces[index] = space;
  } else {
    spaces.push(space);
  }
  
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
}

export function deleteSpace(id: string): void {
  const spaces = getAllSpaces();
  const filtered = spaces.filter((s) => s.id !== id);
  localStorage.setItem(SPACES_KEY, JSON.stringify(filtered));
  
  // Also delete all pages in this space
  const pages = getAllPages();
  const remainingPages = pages.filter((p) => p.spaceId !== id);
  localStorage.setItem(PAGES_KEY, JSON.stringify(remainingPages));
}

export function createSpace(
  name: string,
  icon?: string,
  color?: string,
): NoteSpace {
  const now = Date.now();
  const space: NoteSpace = {
    id: `space-${now}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    icon,
    color,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
  
  saveSpace(space);
  return space;
}

// ============================================================================
// Helpers
// ============================================================================

export function getFavoritesPages(): NotePage[] {
  const pages = getAllPages();
  return pages.filter((p) => p.pinned && !p.archived);
}

export function getRecentPages(limit: number = 10): NotePage[] {
  const pages = getAllPages();
  return pages
    .filter((p) => !p.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
