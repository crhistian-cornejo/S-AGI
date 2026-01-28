// Polyfill Buffer for browser (required by LuckyExcel / @mertdeveci55/univer-import-export)
// This MUST be the first import to ensure Buffer is available before any other module
import './buffer-shim'

import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

// Note: StrictMode is intentionally disabled because Univer's redi DI system
// doesn't handle the mount→unmount→mount cycle well. The double-invoke causes
// stale DI state that breaks when switching between Sheets and Docs instances.
// This only affects development; production works correctly.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
