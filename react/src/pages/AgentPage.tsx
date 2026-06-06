import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useDelegatedActions } from '@privy-io/react-auth'
import { useAuthedFetch } from '../lib/api'

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
  const { delegateWallet } = useDelegatedActions()
  const { address, delegated } = useEmbeddedWallet()
  const authedFetch = useAuthedFetch()

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

  async function authorize() {
    if (!address) return
    setAuthorizing(true)
    try {
      await delegateWallet({ address, chainType: 'ethereum' })
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
      {!delegated ? (
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
          disabled={!delegated}
        />
        <button type="submit" disabled={!delegated || thinking || !message.trim()}>
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
