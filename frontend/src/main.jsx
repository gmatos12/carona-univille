import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

export let root = null

export function mountApp(container = globalThis.document?.getElementById?.('root')) {
  if (!container) return null

  root = createRoot(container)
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )

  return root
}

mountApp()
