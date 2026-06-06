import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App.tsx'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {privyAppId ? (
      <PrivyProvider appId={privyAppId}>
        <App />
      </PrivyProvider>
    ) : (
      <div style={{ padding: 24 }}>
        <h1>Gift Agent</h1>
        <p>Set <code>VITE_PRIVY_APP_ID</code> in <code>react/.env</code> to enable login.</p>
      </div>
    )}
  </StrictMode>,
)
