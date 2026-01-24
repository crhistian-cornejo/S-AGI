/**
 * Custom AI Menu for BlockNote
 *
 * Provides custom AI commands with proper streamTools configuration:
 * - Text corrections use update-only mode (replaces text, doesn't add below)
 * - Content generation uses add-only mode
 * - Full control over AI operations
 */

import { BlockNoteEditor } from "@blocknote/core";
import { DefaultReactSuggestionItem } from "@blocknote/react";
import { AIExtension } from "@blocknote/xl-ai";
import { aiDocumentFormats } from "@blocknote/xl-ai";
import {
  RiCheckLine,
  RiText,
  RiMagicLine,
  RiBallPenLine,
  RiTextWrap,
  RiListCheck3,
  RiCheckFill,
  RiArrowGoBackFill,
  RiLoopLeftFill,
  RiSubtractLine,
  RiAddLine,
  RiTranslate,
  RiPencilLine,
  RiSparklingLine,
} from "react-icons/ri";

export type AIMenuSuggestionItem = Omit<
  DefaultReactSuggestionItem,
  "onItemClick"
> & {
  onItemClick: (setPrompt: (userPrompt: string) => void) => void;
  key: string;
};

/**
 * StreamTools configuration for different operation types:
 *
 * UPDATE_ONLY: For text corrections/improvements - replaces selected text in-place
 * ADD_ONLY: For content generation - adds new content without modifying existing
 * FULL: For complex operations - can add, update, and delete
 */
const STREAM_TOOLS = {
  // For fixing/improving selected text - REPLACES instead of adding below
  UPDATE_ONLY: aiDocumentFormats.html.getStreamToolsProvider({
    defaultStreamTools: {
      add: false,
      delete: false,
      update: true,
    },
  }),
  // For generating new content - adds without modifying existing
  ADD_ONLY: aiDocumentFormats.html.getStreamToolsProvider({
    defaultStreamTools: {
      add: true,
      delete: false,
      update: false,
    },
  }),
  // For complex operations that may need to restructure content
  FULL: aiDocumentFormats.html.getStreamToolsProvider({
    defaultStreamTools: {
      add: true,
      delete: true,
      update: true,
    },
  }),
};

/**
 * Custom AI commands for text with selection (formatting toolbar)
 * These commands REPLACE the selected text instead of adding below
 */
export function getCustomAIMenuItemsWithSelection(
  editor: BlockNoteEditor<any, any, any>,
): AIMenuSuggestionItem[] {
  const ai = editor.getExtension(AIExtension);
  if (!ai) return [];

  return [
    {
      key: "fix_grammar",
      title: "Fix Grammar & Spelling",
      aliases: ["fix", "grammar", "spelling", "correct", "typo"],
      icon: <RiCheckLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Fix all grammar and spelling errors in this text. Keep the same meaning and tone. Only correct errors, don't rephrase.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "improve_writing",
      title: "Improve Writing",
      aliases: ["improve", "enhance", "better", "rewrite"],
      icon: <RiText size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Improve the writing quality of this text. Make it clearer, more concise, and more engaging while preserving the original meaning.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "make_shorter",
      title: "Make Shorter",
      aliases: ["shorter", "concise", "brief", "summarize", "shorten"],
      icon: <RiSubtractLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Make this text more concise. Remove unnecessary words and phrases while keeping the key information intact.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "make_longer",
      title: "Make Longer",
      aliases: ["longer", "expand", "elaborate", "extend"],
      icon: <RiAddLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Expand this text with more details, examples, or explanations. Make it more comprehensive while maintaining the same style and tone.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "simplify",
      title: "Simplify",
      aliases: ["simple", "easy", "plain", "simplify"],
      icon: <RiMagicLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Simplify this text. Use simpler words and shorter sentences. Make it easy to understand for anyone.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "professional",
      title: "Make Professional",
      aliases: ["professional", "formal", "business"],
      icon: <RiPencilLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Rewrite this text in a professional, formal tone suitable for business communication.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "casual",
      title: "Make Casual",
      aliases: ["casual", "informal", "friendly", "relaxed"],
      icon: <RiSparklingLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          useSelection: true,
          userPrompt:
            "Rewrite this text in a casual, friendly, and conversational tone.",
          streamToolsProvider: STREAM_TOOLS.UPDATE_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "translate",
      title: "Translate...",
      aliases: [
        "translate",
        "language",
        "spanish",
        "french",
        "german",
        "english",
      ],
      icon: <RiTranslate size={18} />,
      onItemClick: (setPrompt) => {
        setPrompt("Translate to ");
      },
      size: "small",
    },
  ];
}

/**
 * Custom AI commands without selection (slash menu)
 * These commands ADD new content
 */
export function getCustomAIMenuItemsWithoutSelection(
  editor: BlockNoteEditor<any, any, any>,
): AIMenuSuggestionItem[] {
  const ai = editor.getExtension(AIExtension);
  if (!ai) return [];

  return [
    {
      key: "continue_writing",
      title: "Continue Writing",
      aliases: ["continue", "write", "more"],
      icon: <RiBallPenLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          userPrompt:
            "Continue writing at the current cursor position. Follow the style and context of the previous text. Be natural and coherent.",
          streamToolsProvider: STREAM_TOOLS.ADD_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "summarize",
      title: "Summarize Document",
      aliases: ["summary", "summarize", "tldr"],
      icon: <RiTextWrap size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          userPrompt:
            "Create a concise summary of the document above. Capture the key points in a few sentences.",
          streamToolsProvider: STREAM_TOOLS.ADD_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "action_items",
      title: "Extract Action Items",
      aliases: ["action", "tasks", "todo", "items"],
      icon: <RiListCheck3 size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          userPrompt:
            "Extract all action items and tasks from the document. Create a bulleted list of actionable items.",
          streamToolsProvider: STREAM_TOOLS.ADD_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "brainstorm",
      title: "Brainstorm Ideas",
      aliases: ["brainstorm", "ideas", "creative"],
      icon: <RiSparklingLine size={18} />,
      onItemClick: async () => {
        await ai.invokeAI({
          userPrompt:
            "Based on the context above, brainstorm related ideas, suggestions, or next steps. Be creative and helpful.",
          streamToolsProvider: STREAM_TOOLS.ADD_ONLY,
        });
      },
      size: "small",
    },
    {
      key: "write_anything",
      title: "Write About...",
      aliases: ["write", "anything", "custom"],
      icon: <RiBallPenLine size={18} />,
      onItemClick: (setPrompt) => {
        setPrompt("Write about ");
      },
      size: "small",
    },
  ];
}

/**
 * Review items shown after AI generates content
 */
export function getCustomAIMenuItemsForReview(
  editor: BlockNoteEditor<any, any, any>,
): AIMenuSuggestionItem[] {
  const ai = editor.getExtension(AIExtension);
  if (!ai) return [];

  return [
    {
      key: "accept",
      title: "Accept Changes",
      aliases: ["accept", "confirm", "ok", "yes"],
      icon: <RiCheckFill size={18} />,
      onItemClick: () => {
        ai.acceptChanges();
      },
      size: "small",
    },
    {
      key: "revert",
      title: "Revert Changes",
      aliases: ["revert", "undo", "cancel", "no"],
      icon: <RiArrowGoBackFill size={18} />,
      onItemClick: () => {
        ai.rejectChanges();
      },
      size: "small",
    },
  ];
}

/**
 * Error recovery items
 */
export function getCustomAIMenuItemsForError(
  editor: BlockNoteEditor<any, any, any>,
): AIMenuSuggestionItem[] {
  const ai = editor.getExtension(AIExtension);
  if (!ai) return [];

  return [
    {
      key: "retry",
      title: "Retry",
      aliases: ["retry", "again", "try"],
      icon: <RiLoopLeftFill size={18} />,
      onItemClick: async () => {
        await ai.retry();
      },
      size: "small",
    },
    {
      key: "cancel",
      title: "Cancel",
      aliases: ["cancel", "close", "stop"],
      icon: <RiArrowGoBackFill size={18} />,
      onItemClick: () => {
        ai.rejectChanges();
      },
      size: "small",
    },
  ];
}

/**
 * Main function to get AI menu items based on current state
 */
export function getCustomAIMenuItems(
  editor: BlockNoteEditor<any, any, any>,
  aiResponseStatus:
    | "user-input"
    | "thinking"
    | "ai-writing"
    | "error"
    | "user-reviewing"
    | "closed",
): AIMenuSuggestionItem[] {
  if (aiResponseStatus === "user-input") {
    return editor.getSelection()
      ? getCustomAIMenuItemsWithSelection(editor)
      : getCustomAIMenuItemsWithoutSelection(editor);
  } else if (aiResponseStatus === "user-reviewing") {
    return getCustomAIMenuItemsForReview(editor);
  } else if (aiResponseStatus === "error") {
    return getCustomAIMenuItemsForError(editor);
  } else {
    return [];
  }
}
