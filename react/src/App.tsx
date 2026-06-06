import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

function App() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const [meResult, setMeResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Calls the protected GET /api/me with the Privy access token to prove the
  // SPA -> API -> Privy verification chain (and CORS) end to end.
  async function callMe() {
    setLoading(true)
    setMeResult('')
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      setMeResult(`${res.status} ${JSON.stringify(body)}`)
    } catch (err) {
      setMeResult(`error: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return <p style={{ padding: 24 }}>Loading…</p>

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Gift Agent</h1>

      {authenticated ? (
        <>
          <p>Logged in as <code>{user?.id}</code></p>
          <button onClick={logout}>Log out</button>{' '}
          <button onClick={callMe} disabled={loading}>
            {loading ? 'Calling…' : 'Call GET /api/me'}
          </button>
          {meResult && (
            <pre style={{ marginTop: 16, background: '#f4f4f4', padding: 12 }}>{meResult}</pre>
          )}
        </>
      ) : (
        <button onClick={login}>Log in with Privy</button>
      )}
    </div>
  )
}

export default App
