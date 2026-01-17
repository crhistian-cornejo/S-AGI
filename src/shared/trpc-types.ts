/**
 * tRPC Router Type Export
 * 
 * This file ONLY exports the type of the AppRouter.
 * It's designed to be imported by the renderer process using `import type`.
 * 
 * IMPORTANT: This file should NOT be bundled with the renderer.
 * Use `import type { AppRouter } from '@shared/trpc-types'` to ensure
 * only the type is imported, not the actual router code.
 */

// We need to import the actual router to get its type
// This file will only be used by TypeScript for type checking
import type { appRouter } from '../main/lib/trpc'

// Export only the type
export type AppRouter = typeof appRouter
