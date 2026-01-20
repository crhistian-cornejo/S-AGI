import ReactDOM from 'react-dom/client'
import { QuickPrompt } from './features/quick-prompt/quick-prompt'

const rootElement = document.getElementById('root')
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<QuickPrompt />)
}
