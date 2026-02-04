import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

const __dirname = import.meta.dirname
const isDev = process.env.NODE_ENV !== 'production'

// Plugin to copy icons to output directory
function copyTrayIcons() {
    const copyIcons = () => {
        const trayIcons = ['trayTemplate.png', 'trayTemplate@2x.png', 'trayTemplate.svg']
        const appIcons = ['icon.icns', 'icon.ico']
        const resourceIcons = ['logo.svg'] // For Linux

        const srcMainDir = resolve(__dirname, 'apps/electron/main')
        const srcBuildDir = resolve(__dirname, 'apps/electron/build')
        const srcResourcesDir = resolve(__dirname, 'apps/electron/resources')
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

        // Copy resource icons (logo for Linux)
        for (const icon of resourceIcons) {
            const src = resolve(srcResourcesDir, icon)
            const dest = resolve(outDir, icon)
            if (existsSync(src)) {
                copyFileSync(src, dest)
                console.log(`Copied resource ${icon} to out/main/`)
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
        envPrefix: ['MAIN_VITE_', 'VITE_'],
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
                    '@libpdf/core',
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
                '@main': resolve('apps/electron/main'),
                '@shared': resolve('apps/electron/shared'),
                '@s-agi/core': resolve('packages/core/src')
            }
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'apps/electron/main/index.ts')
                },
                external: ['electron', 'better-sqlite3', 'sharp'],
                output: {
                    format: 'cjs'
                }
            }
        }
    },
    preload: {
        envPrefix: ['MAIN_VITE_', 'VITE_'],
        plugins: [
            externalizeDepsPlugin({
                exclude: ['trpc-electron']
            })
        ],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'apps/electron/preload/index.ts')
                },
                external: ['electron'],
                output: {
                    format: 'cjs'
                }
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'apps/electron/renderer'),
        publicDir: resolve(__dirname, 'apps/electron/resources'),
        resolve: {
            alias: {
                '@': resolve('apps/electron/renderer'),
                '@shared': resolve('apps/electron/shared'),
                '@s-agi/core': resolve('packages/core/src'),
                // Subpaths of numfmt must resolve to the real package (facade, etc.)
                '@univerjs/sheets-numfmt/facade': resolve(__dirname, 'node_modules/@univerjs/sheets-numfmt/lib/es/facade.js'),
                // Real package for the patch (avoids circular alias; TS: see tsconfig paths)
                '@univerjs/sheets-numfmt$real': resolve(__dirname, 'node_modules/@univerjs/sheets-numfmt'),
                // Main entry: extended currency symbols (PEN, MX$, R$, etc.)
                '@univerjs/sheets-numfmt': resolve(__dirname, 'apps/electron/renderer/features/univer/numfmt-currency-patch.ts'),
            },
            // Dedupe redi so all Univer packages share one @wendellhu/redi instance.
            // Prevents "Identifier rpc.remote-sync.service already exists" and
            // "You are loading scripts of redi more than once".
            dedupe: ['@wendellhu/redi'],
        },
        define: {
            'global': 'globalThis',
        },
        optimizeDeps: {
            include: ['@wendellhu/redi', 'xlsx'],
            force: true,
        },
        plugins: [
            react({
                // In dev mode, use WDYR as JSX import source to track ALL component re-renders
                // See apps/electron/renderer/DEBUG-WDYR.md for usage
                jsxImportSource: isDev ? '@welldone-software/why-did-you-render' : undefined,
            }),
        ],
        build: {
            // Optimize chunk size warnings
            chunkSizeWarningLimit: 1500,
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'apps/electron/renderer/index.html'),
                    'tray-popover': resolve(__dirname, 'apps/electron/renderer/tray-popover.html'),
                    'quick-prompt': resolve(__dirname, 'apps/electron/renderer/quick-prompt.html')
                },
                output: {
                    // Dynamic code splitting based on module paths
                    manualChunks(id) {
                        // Split large vendor libraries into separate chunks
                        if (id.includes('node_modules')) {
                            // React ecosystem
                            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                                return 'vendor-react';
                            }
                            // Radix UI
                            if (id.includes('@radix-ui')) {
                                return 'vendor-radix';
                            }
                            // Charts (recharts is heavy)
                            if (id.includes('recharts') || id.includes('d3-')) {
                                return 'vendor-charts';
                            }
                            // Shiki (syntax highlighting)
                            if (id.includes('shiki') || id.includes('@shikijs')) {
                                return 'vendor-shiki';
                            }
                            // Univer (spreadsheets)
                            if (id.includes('@univerjs')) {
                                return 'vendor-univer';
                            }
                        }
                    }
                }
            },
            // Minification optimizations
            minify: 'esbuild',
            target: 'esnext',
        }
    }
})
