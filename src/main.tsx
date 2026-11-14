import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from '@/App'
import { initTelegram } from '@/services/telegram'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

// 1. Tell the Telegram client the Mini App is ready (no-op in a browser).
initTelegram()

// 2. Adopt the Telegram colorScheme, or the admin/system preference in a browser.
useThemeStore.getState().initTheme()

// 3. Seed the session: real Telegram user inside the client, demo user in a
//    browser preview (VITE_DEMO_MODE=true).
useAuthStore.getState().hydrateSession()

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
