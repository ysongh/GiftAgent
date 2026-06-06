import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useSigners } from '@privy-io/react-auth'
import { useAuthedFetch } from '../lib/api'

// The authorization key's id (from the Privy dashboard). The client adds it as a
// session signer on the user's TEE wallet so the server can sign on their behalf.
const AUTH_SIGNER_ID = import.meta.env.VITE_PRIVY_AUTHORIZATION_KEY_ID as string | undefined

interface Budget {
  cap: number
  spent: number
  remaining: number
}

interface Spend {
  service: string
  cost: number
  txHash: string | null
}

/** Find the user's Privy embedded wallet from their linked accounts. */
function useEmbeddedWallet() {
  const { user } = usePrivy()
  const account = user?.linkedAccounts?.find(
    (a) => a.type === 'wallet' && (a as { walletClientType?: string }).walletClientType === 'privy',
  ) as { address?: string; delegated?: boolean } | undefined
  return { address: account?.address, delegated: Boolean(account?.delegated) }
}

export default function AgentPage() {
  const { ready, authenticated, login } = usePrivy()
  const { addSigners } = useSigners()
  const { address, delegated } = useEmbeddedWallet()
  const authedFetch = useAuthedFetch()

  // Authorized = a session signer is on the wallet. Seed from the wallet's
  // delegated flag, and flip true after a successful addSigners call.
  const [authorized, setAuthorized] = useState(false)

  const [budget, setBudget] = useState<Budget | null>(null)
  const [budgetError, setBudgetError] = useState('')
  const [authorizing, setAuthorizing] = useState(false)

  const [message, setMessage] = useState('')
  const [thinking, setThinking] = useState(false)
  const [reply, setReply] = useState('')
  const [spends, setSpends] = useState<Spend[]>([])
  const [chatError, setChatError] = useState('')

  const refreshBudget = useCallback(async () => {
    setBudgetError('')
    try {
      const res = await authedFetch('/api/budget')
      if (res.status === 404) {
        setBudget(null)
        setBudgetError('No claimed gift found — claim a gift first.')
        return
      }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`)
      setBudget(body as Budget)
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : String(err))
    }
  }, [authedFetch])

  useEffect(() => {
    if (authenticated) void refreshBudget()
  }, [authenticated, refreshBudget])

  // Seed authorized state from the wallet's delegated flag once known.
  useEffect(() => {
    if (delegated) setAuthorized(true)
  }, [delegated])

  async function authorize() {
    if (!address) return
    if (!AUTH_SIGNER_ID) {
      setChatError(
        'VITE_PRIVY_AUTHORIZATION_KEY_ID is not set. Add your Privy authorization key id to react/.env.',
      )
      return
    }
    setAuthorizing(true)
    setChatError('')
    try {
      // Add the app's authorization key as a session signer on the TEE wallet.
      await addSigners({ address, signers: [{ signerId: AUTH_SIGNER_ID }] })
      setAuthorized(true)
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuthorizing(false)
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    setThinking(true)
    setChatError('')
    setReply('')
    setSpends([])
    try {
      const res = await authedFetch('/api/agent', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`)
      setReply(body.reply)
      setSpends(body.spends ?? [])
      await refreshBudget()
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err))
    } finally {
      setThinking(false)
    }
  }

  if (!ready) return <p>Loading…</p>
  if (!authenticated) {
    return (
      <section>
        <p>Log in to use the agent.</p>
        <button onClick={login}>Log in with Privy</button>
      </section>
    )
  }

  return (
    <section>
      <h2>Spending agent</h2>

      {/* Budget readout */}
      {budget ? (
        <p style={{ padding: 12, background: '#eef', borderRadius: 8 }}>
          Budget: <strong>{budget.remaining}</strong> USDC remaining
          <span style={{ color: '#666' }}> (cap {budget.cap}, spent {budget.spent})</span>
        </p>
      ) : (
        budgetError && <p style={{ color: '#a60' }}>{budgetError}</p>
      )}

      {/* Authorize step */}
      {!authorized ? (
        <div style={{ padding: 16, background: '#fff6e5', borderRadius: 8, marginBottom: 16 }}>
          <p>Authorize the agent to spend your gifted USDC on your behalf (one-time consent).</p>
          <button onClick={authorize} disabled={authorizing || !address}>
            {authorizing ? 'Authorizing…' : 'Authorize agent'}
          </button>
        </div>
      ) : (
        <p style={{ color: 'green' }}>✓ Agent authorized for wallet <code>{address}</code></p>
      )}

      {/* Chat */}
      <form onSubmit={sendMessage} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask the agent to do something that may require a paid service…"
          rows={3}
          style={{ padding: 8, fontFamily: 'inherit' }}
          disabled={!authorized}
        />
        <button type="submit" disabled={!authorized || thinking || !message.trim()}>
          {thinking ? 'Thinking…' : 'Send'}
        </button>
      </form>

      {chatError && <p style={{ color: 'crimson' }}>{chatError}</p>}

      {reply && (
        <div style={{ marginTop: 16, padding: 12, background: '#f6f6f6', borderRadius: 8 }}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{reply}</p>
          {spends.length > 0 && (
            <ul style={{ marginTop: 12 }}>
              {spends.map((s, i) => (
                <li key={i}>
                  Spent <strong>{s.cost}</strong> USDC on {s.service}
                  {s.txHash && (
                    <>
                      {' '}—{' '}
                      <a
                        href={`https://sepolia.basescan.org/tx/${s.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        tx
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
