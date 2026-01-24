/**
 * Image Tool Definitions
 * Schema definitions for AI image generation and editing tools
 */

import { z } from 'zod'

export const IMAGE_TOOLS = {
    generate_image: {
        description: 'Generate an image using AI (GPT Image 1.5). Creates high-quality images from text descriptions. Supports transparent backgrounds for logos, icons, and product images.',
        inputSchema: z.object({
            prompt: z.string().describe('Detailed description of the image to generate. Be specific about style, colors, composition, and any text to include.'),
            size: z.enum(['1024x1024', '1536x1024', '1024x1536', 'auto']).optional().describe('Image dimensions. 1024x1024 (square), 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).'),
            quality: z.enum(['low', 'medium', 'high', 'auto']).optional().describe('Image quality. Higher quality takes longer but produces better results. Default: auto.'),
            background: z.enum(['transparent', 'opaque', 'auto']).optional().describe('Background type. Use transparent for logos, icons, subjects without backgrounds. Default: auto.'),
            output_format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Output format. Use png for transparency, jpeg for photos, webp for web. Default: png.'),
            n: z.number().min(1).max(4).optional().describe('Number of images to generate (1-4). Default: 1.')
        })
    },
    edit_image: {
        description: 'Edit an existing image using AI. Can modify specific areas using a mask, extend images, or make global edits.',
        inputSchema: z.object({
            prompt: z.string().describe('Description of the edits to make. Be specific about what to change, add, or remove.'),
            imageBase64: z.string().describe('Base64-encoded source image (PNG, JPEG, or WebP, max 25MB)'),
            maskBase64: z.string().optional().describe('Optional base64-encoded mask image. White areas will be edited, black areas preserved. Must be same size as source.'),
            size: z.enum(['1024x1024', '1536x1024', '1024x1536', 'auto']).optional().describe('Output image dimensions.'),
            quality: z.enum(['low', 'medium', 'high', 'auto']).optional().describe('Image quality level.'),
            n: z.number().min(1).max(4).optional().describe('Number of edited images to generate (1-4). Default: 1.')
        })
    }
} as const

export type ImageToolName = keyof typeof IMAGE_TOOLS
