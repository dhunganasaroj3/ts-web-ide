// IMPORTANT: import monaco-env first so MonacoEnvironment + the bundled monaco
// loader are configured before any editor mounts.
import './monaco-env'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
