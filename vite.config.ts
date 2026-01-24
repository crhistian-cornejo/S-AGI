import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const rendererRoot = resolve(__dirname, 'apps/electron/renderer')

export default defineConfig({
    // Run Vite directly against the renderer folder so it matches electron-vite's renderer setup
    root: rendererRoot,
    plugins: [react()],
    resolve: {
        alias: {
            '@': rendererRoot,
            '@shared': resolve(__dirname, 'apps/electron/shared')
        },
        // Dedupe redi so all Univer packages share one @wendellhu/redi instance
        dedupe: ['@wendellhu/redi'],
    },
    optimizeDeps: {
        include: ['@wendellhu/redi'],
        force: true,
    },
    build: {
        // Build a pure-web bundle separate from Electron's out/main + out/renderer
        outDir: resolve(__dirname, 'out/web'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(rendererRoot, 'index.html')
            }
        }
    }
})
