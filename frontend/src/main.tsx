import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts tự host (fontsource) — Inter Variable + IBM Plex Mono, gồm subset
// latin + vietnamese (dấu tiếng Việt không lệ thuộc Google Fonts CDN).
import '@fontsource-variable/inter/wght.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/ibm-plex-mono/vietnamese-500.css'
import '@fontsource/ibm-plex-mono/vietnamese-600.css'
import '@fontsource/ibm-plex-mono/vietnamese-700.css'

import './styles/index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
