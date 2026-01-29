/**
 * Document Tool Definitions
 * Schema definitions for Word-like document tools (FREE - no license required)
 */

import { z } from 'zod'

export const DOCUMENT_TOOLS = {
    create_document: {
        description: 'Create a new Word-like document with an optional title and initial text content.',
        inputSchema: z.object({
            title: z.string().describe('Title of the document'),
            content: z.string().optional().describe('Initial text content for the document. Use newlines (\\n) to separate paragraphs.')
        })
    },
    insert_text: {
        description: 'Insert text at the end of a document or at a specific position.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Text to insert'),
            position: z.enum(['end', 'start']).default('end').describe('Where to insert the text')
        })
    },
    replace_document_content: {
        description: 'Replace the entire content of a document with new text.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            content: z.string().describe('New text content for the document')
        })
    },
    get_document_content: {
        description: 'Get the text content of a document. Use this to read what is currently in the document before making modifications.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact')
        })
    },
    format_document_text: {
        description: 'Apply formatting to a range of text in a document. Supports bold, italic, underline, font size, and colors.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            startIndex: z.number().describe('Start character index (0-based)'),
            endIndex: z.number().describe('End character index (exclusive)'),
            formatting: z.object({
                bold: z.boolean().optional().describe('Make text bold'),
                italic: z.boolean().optional().describe('Make text italic'),
                underline: z.boolean().optional().describe('Underline text'),
                strikethrough: z.boolean().optional().describe('Strikethrough text'),
                fontSize: z.number().optional().describe('Font size in points'),
                fontColor: z.string().optional().describe('Text color as hex (e.g., #FF0000)'),
                backgroundColor: z.string().optional().describe('Highlight/background color as hex'),
                fontFamily: z.string().optional().describe('Font family (e.g., Arial, Times New Roman)')
            }).describe('Formatting options to apply')
        })
    },
    add_heading: {
        description: 'Add a heading to the document. Creates properly styled heading text.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Heading text'),
            level: z.enum(['h1', 'h2', 'h3', 'h4']).describe('Heading level (h1 is largest)'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the heading')
        })
    },
    add_bullet_list: {
        description: 'Add a bullet list to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            items: z.array(z.string()).describe('List items to add'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the list')
        })
    },
    add_numbered_list: {
        description: 'Add a numbered list to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            items: z.array(z.string()).describe('List items to add'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the list')
        })
    },
    add_table: {
        description: 'Add a table to the document with specified headers and rows.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            headers: z.array(z.string()).describe('Column headers'),
            rows: z.string().describe('JSON string of 2D array with row data. Example: [["John", "25"], ["Jane", "30"]]'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the table')
        })
    },
    add_link: {
        description: 'Add a hyperlink to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Display text for the link'),
            url: z.string().describe('URL the link points to'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the link')
        })
    },
    add_horizontal_rule: {
        description: 'Add a horizontal divider line to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the divider')
        })
    },
    add_code_block: {
        description: 'Add a code block to the document with optional syntax highlighting.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            code: z.string().describe('The code content'),
            language: z.string().optional().describe('Programming language for syntax highlighting (e.g., javascript, python)'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the code block')
        })
    },
    add_quote: {
        description: 'Add a blockquote to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Quote text'),
            author: z.string().optional().describe('Optional attribution/author'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the quote')
        })
    },
    find_replace_document: {
        description: 'Find and replace text in a document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            find: z.string().describe('Text to find'),
            replace: z.string().describe('Text to replace with'),
            matchCase: z.boolean().optional().default(false).describe('Case-sensitive search')
        })
    }
} as const

export type DocumentToolName = keyof typeof DOCUMENT_TOOLS
