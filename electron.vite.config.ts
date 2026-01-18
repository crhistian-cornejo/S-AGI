import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

const __dirname = import.meta.dirname

// Plugin to copy tray icons to output directory
function copyTrayIcons() {
    return {
        name: 'copy-tray-icons',
        closeBundle() {
            const icons = ['trayTemplate.png', 'trayTemplate@2x.png', 'trayTemplate.svg']
            const srcDir = resolve(__dirname, 'src/main')
            const outDir = resolve(__dirname, 'out/main')
            
            if (!existsSync(outDir)) {
                mkdirSync(outDir, { recursive: true })
            }
            
            for (const icon of icons) {
                const src = resolve(srcDir, icon)
                const dest = resolve(outDir, icon)
                if (existsSync(src)) {
                    copyFileSync(src, dest)
                    console.log(`Copied ${icon} to out/main/`)
                }
            }
        }
    }
}

export default defineConfig({
    main: {
        plugins: [
            externalizeDepsPlugin({
                // Don't externalize these - bundle them instead
                exclude: ['superjson', 'trpc-electron']
            }),
            copyTrayIcons()
        ],
        resolve: {
            alias: {
                '@main': resolve('src/main'),
                '@shared': resolve('src/shared')
            }
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts')
                },
                external: ['electron', 'better-sqlite3'],
                output: {
                    format: 'cjs'
                }
            }
        }
    },
    preload: {
        plugins: [
            externalizeDepsPlugin({
                exclude: ['trpc-electron']
            })
        ],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts')
                },
                external: ['electron'],
                output: {
                    format: 'cjs'
                }
            }
        }
    },
    renderer: {
        resolve: {
            alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared')
            }
        },
        plugins: [react()],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html')
                }
            }
        }
    }
})
