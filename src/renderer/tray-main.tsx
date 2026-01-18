import ReactDOM from 'react-dom/client'
import { TrayPopover } from './features/tray-popover/tray-popover'

// Tray popover entry point - minimal setup without full app providers
const rootElement = document.getElementById('root')
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<TrayPopover />)
}
