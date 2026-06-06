import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { API_URL, useAuthedFetch } from '../lib/api'

interface GiftInfo {
  amountUsdc: number
  status: string
  sender: string
  alreadyClaimed: boolean
  claimTxHash: string | null
}

interface ClaimResult {
  walletAddress: string
  txHash: string
  balanceUsdc: string | null
  amountUsdc: number
}

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>()
  const { ready, authenticated, login, logout, user } = usePrivy()
  const authedFetch = useAuthedFetch()

  const [gift, setGift] = useState<GiftInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [result, setResult] = useState<ClaimResult | null>(null)

  // Load public gift info (no auth) for the claim page.
  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/api/gifts/${token}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `Not found (${res.status})`)
        setGift(body as GiftInfo)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
  }, [token])

  async function claim() {
    setClaiming(true)
    setClaimError('')
    try {
      const res = await authedFetch(`/api/gifts/${token}/claim`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Claim failed (${res.status})`)
      setResult(body as ClaimResult)
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : String(err))
    } finally {
      setClaiming(false)
    }
  }

  if (loadError) return <p style={{ color: 'crimson' }}>{loadError}</p>
  if (!gift) return <p>Loading gift…</p>

  return (
    <section>
      <h2>You've been gifted ${gift.amountUsdc} USDC</h2>
      <p style={{ color: '#666' }}>From {gift.sender}</p>

      {result ? (
        <div style={{ padding: 16, background: '#f1f8f1', borderRadius: 8 }}>
          <p><strong>🎉 Claimed!</strong></p>
          <p>Sent to your wallet: <code>{result.walletAddress}</code></p>
          {result.balanceUsdc != null && <p>New USDC balance: <strong>{result.balanceUsdc}</strong></p>}
          <p>
            Tx:{' '}
            <a href={`https://sepolia.basescan.org/tx/${result.txHash}`} target="_blank" rel="noreferrer">
              {result.txHash.slice(0, 12)}…
            </a>
          </p>
          <p style={{ marginTop: 12 }}>
            <Link to="/agent">→ Authorize the agent and start spending</Link>
          </p>
        </div>
      ) : gift.alreadyClaimed ? (
        <p style={{ color: '#a60' }}>
          This gift has already been claimed
          {gift.claimTxHash ? (
            <> (tx <code>{gift.claimTxHash.slice(0, 12)}…</code>).</>
          ) : (
            '.'
          )}
        </p>
      ) : !ready ? (
        <p>Loading…</p>
      ) : !authenticated ? (
        <div>
          <p>Log in with the email this gift was sent to, then claim it.</p>
          <button onClick={login}>Log in to claim</button>
        </div>
      ) : (
        <div>
          <p style={{ color: '#666' }}>
            Logged in as <code>{user?.id}</code>{' '}
            <button onClick={logout} style={{ marginLeft: 8 }}>Log out</button>
          </p>
          <button onClick={claim} disabled={claiming}>
            {claiming ? 'Claiming…' : `Claim $${gift.amountUsdc} USDC`}
          </button>
          {claimError && <p style={{ color: 'crimson' }}>{claimError}</p>}
        </div>
      )}
    </section>
  )
}
