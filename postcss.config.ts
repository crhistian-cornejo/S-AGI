/**
 * PostCSS Configuration
 *
 * Wrapper that points to apps/electron tailwind config.
 * Required at root for electron-vite compatibility.
 */
export default {
  plugins: {
    tailwindcss: {
      config: './apps/electron/tailwind.config.ts'
    },
    autoprefixer: {},
  },
}
