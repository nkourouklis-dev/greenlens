import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Temporary on-device debug console. Dynamically imported so it never
// ships in the normal production bundle — only loaded when a tester
// explicitly opts in via ?debug=1, and initialized before the app renders
// so it's already capturing console output when the camera flow starts.
async function initDebugConsoleIfRequested(): Promise<void> {
  if (new URLSearchParams(window.location.search).get('debug') !== '1') {
    return
  }

  const eruda = (await import('eruda')).default
  eruda.init()
}

await initDebugConsoleIfRequested()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
