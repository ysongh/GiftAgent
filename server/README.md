# GiftAgent server

Express + TypeScript (ESM) backend. Chain: Base (Sepolia for now, configurable via `NETWORK`).

## Setup

```bash
pnpm install
cp .env.example .env   # fill in Privy, Supabase, etc.
```

Apply the SQL migrations to your Supabase project (SQL editor or CLI), in order:

- `db/migrations/0001_init.sql` — gifts / claims / ledger
- `db/migrations/0002_gift_claim.sql` — Phase 1: `claim_token`, `claim_tx_hash`, status lifecycle

## Treasury wallet (funds gifts on claim)

The treasury is a Privy server wallet. Create it once:

```bash
pnpm treasury:setup
```

Copy the printed `TREASURY_WALLET_ID` and `TREASURY_WALLET_ADDRESS` into `.env`, then fund the
address:

- **USDC** — required. On Base Sepolia use the Circle faucet: https://faucet.circle.com
- **Gas** — the treasury signs a real ERC-20 transfer on claim, which costs gas:
  - If you've configured a **gas sponsorship policy** in the Privy dashboard, set
    `TREASURY_GAS_SPONSORED=true` and the wallet needs **no ETH**.
  - Otherwise (default), fund the treasury address with a little **Base ETH** for gas.

Re-run `pnpm treasury:setup` anytime to print the current USDC/ETH balances.

## Run

```bash
pnpm dev   # http://localhost:4000
```

### Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | — | health check |
| `GET /api/me` | access token | verified user id |
| `POST /api/gifts` | access token | create a gift, email the claim link |
| `GET /api/gifts/:token` | token only | claim-page display info |
| `POST /api/gifts/:token/claim` | access token + `privy-id-token` header | transfer USDC from treasury to the recipient's embedded wallet |

All signing and keys stay server-side. The recipient's email + embedded wallet address are
read from the verified Privy **identity token** — never trusted from the client.

## Email

`EMAIL_PROVIDER=resend` (with `RESEND_API_KEY`) sends real mail. Any other value is console-only.
The claim link is **always** logged to the server console, so the demo works with no email setup.

## x402 (Phase 0)

`pnpm x402:seller` + `pnpm x402:test` exercise the x402 payment loop. See `scripts/`.
