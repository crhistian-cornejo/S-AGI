import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const rendererRoot = resolve(__dirname, 'src/renderer')

export default defineConfig({
    // Run Vite directly against the renderer folder so it matches electron-vite's renderer setup
    root: rendererRoot,
    plugins: [react()],
    resolve: {
        alias: {
            '@': rendererRoot,
            '@shared': resolve(__dirname, 'src/shared')
        }
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
