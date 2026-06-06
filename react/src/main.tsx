import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {privyAppId ? (
      <PrivyProvider
        appId={privyAppId}
        config={{
          loginMethods: ['email'],
          // Ensure every user has an Ethereum embedded wallet at login, so the
          // address exists by claim time.
          embeddedWallets: {
            ethereum: { createOnLogin: 'all-users' },
          },
        }}
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PrivyProvider>
    ) : (
      <div style={{ padding: 24 }}>
        <h1>Gift Agent</h1>
        <p>Set <code>VITE_PRIVY_APP_ID</code> in <code>react/.env</code> to enable login.</p>
      </div>
    )}
  </StrictMode>,
)
