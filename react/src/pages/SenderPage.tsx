import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthedFetch } from '../lib/api'

export default function SenderPage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const authedFetch = useAuthedFetch()

  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const [claimUrl, setClaimUrl] = useState<string>('')
  const [error, setError] = useState<string>('')

  async function createGift(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setClaimUrl('')
    try {
      const res = await authedFetch('/api/gifts', {
        method: 'POST',
        body: JSON.stringify({ recipient_email: email, amount_usdc: Number(amount) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setClaimUrl(body.claimUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) return <p>Loading…</p>

  if (!authenticated) {
    return (
      <section>
        <p>Log in to send a gift.</p>
        <button onClick={login}>Log in with Privy</button>
      </section>
    )
  }

  return (
    <section>
      <p style={{ color: '#666' }}>
        Logged in as <code>{user?.id}</code>{' '}
        <button onClick={logout} style={{ marginLeft: 8 }}>Log out</button>
      </p>

      <h2>Send a USDC gift</h2>
      <form onSubmit={createGift} style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <label>
          Recipient email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            style={{ display: 'block', width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Amount (USDC)
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create gift'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {claimUrl && (
        <div style={{ marginTop: 20, padding: 16, background: '#f1f8f1', borderRadius: 8 }}>
          <p><strong>Gift created!</strong> Share this claim link (also emailed / logged server-side):</p>
          <p><a href={claimUrl}>{claimUrl}</a></p>
        </div>
      )}
    </section>
  )
}
