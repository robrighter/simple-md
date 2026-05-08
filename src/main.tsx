import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App'
import { DialogProvider } from './components/Dialog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
)
