// Buffer polyfill for browser (if needed by other modules)
// Note: SheetJS (xlsx) doesn't require Buffer polyfill, but keeping for compatibility
import './buffer-shim'

import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

// Note: StrictMode is intentionally disabled because Univer's redi DI system
// doesn't handle the mount→unmount→mount cycle well. The double-invoke causes
// stale DI state that breaks when switching between Sheets and Docs instances.
// This only affects development; production works correctly.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
