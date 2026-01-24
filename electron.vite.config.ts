import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

const __dirname = import.meta.dirname

// Plugin to copy icons to output directory
function copyTrayIcons() {
    const copyIcons = () => {
        const trayIcons = ['trayTemplate.png', 'trayTemplate@2x.png', 'trayTemplate.svg']
        const appIcons = ['icon.icns', 'icon.ico']
        
        const srcMainDir = resolve(__dirname, 'src/main')
        const srcBuildDir = resolve(__dirname, 'build')
        const outDir = resolve(__dirname, 'out/main')
        
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true })
        }
        
        // Copy tray icons from src/main
        for (const icon of trayIcons) {
            const src = resolve(srcMainDir, icon)
            const dest = resolve(outDir, icon)
            if (existsSync(src)) {
                copyFileSync(src, dest)
                console.log(`Copied tray icon ${icon} to out/main/`)
            }
        }

        // Copy app icons from build
        for (const icon of appIcons) {
            const src = resolve(srcBuildDir, icon)
            const dest = resolve(outDir, icon)
            if (existsSync(src)) {
                copyFileSync(src, dest)
                console.log(`Copied app icon ${icon} to out/main/`)
            }
        }
    }

    return {
        name: 'copy-icons',
        buildStart() {
            copyIcons()
        },
        closeBundle() {
            copyIcons()
        }
    }
}

export default defineConfig({
    main: {
        plugins: [
            externalizeDepsPlugin({
                // Don't externalize these - bundle them instead
                exclude: [
                    'superjson', 
                    'trpc-electron', 
                    'jose', 
                    'ai', 
                    '@ai-sdk/openai', 
                    'unpdf',
                    '@blocknote/xl-ai',
                    '@blocknote/core',
                    'prosemirror-highlight',
                    'remark-gfm',
                    'remark-breaks'
                ]
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
                '@shared': resolve('src/shared'),
                // Subpaths of numfmt must resolve to the real package (facade, etc.)
                '@univerjs/sheets-numfmt/facade': resolve(__dirname, 'node_modules/@univerjs/sheets-numfmt/lib/es/facade.js'),
                // Real package for the patch (avoids circular alias; TS: see tsconfig paths)
                '@univerjs/sheets-numfmt$real': resolve(__dirname, 'node_modules/@univerjs/sheets-numfmt'),
                // Main entry: extended currency symbols (PEN, MX$, R$, etc.)
                '@univerjs/sheets-numfmt': resolve(__dirname, 'src/renderer/features/univer/numfmt-currency-patch.ts'),
            },
            // Dedupe redi so all Univer packages share one @wendellhu/redi instance.
            // Prevents "Identifier rpc.remote-sync.service already exists" and
            // "You are loading scripts of redi more than once".
            dedupe: ['@wendellhu/redi'],
        },
        optimizeDeps: {
            include: ['@wendellhu/redi'],
            force: true,
        },
        plugins: [react()],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html'),
                    'tray-popover': resolve(__dirname, 'src/renderer/tray-popover.html'),
                    'quick-prompt': resolve(__dirname, 'src/renderer/quick-prompt.html')
                }
            }
        }
    }
})
