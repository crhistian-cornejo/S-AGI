import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const __dirname = import.meta.dirname

export default defineConfig({
    main: {
        plugins: [
            externalizeDepsPlugin({
                // Don't externalize these - bundle them instead
                exclude: ['superjson', 'trpc-electron']
            })
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
