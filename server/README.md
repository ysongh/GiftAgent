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

## Phase 2: the spending agent (delegated x402)

The recipient's embedded wallet is the x402 payer. The server signs payments on their behalf
via **Privy delegated actions**: the user grants one-time consent in the SPA, and the server
signs in Privy's TEE using a P-256 authorization key. The gift amount is a hard budget cap.

This app uses Privy **TEE wallets**, so server access is granted via **session signers**
(not on-device `delegateWallet`). The server signs by authorizing wallet RPCs with the
app's P-256 authorization key, which the user adds to their wallet as a session signer.

### Privy Dashboard setup (required, one-time)

1. **Create an authorization key.** Dashboard → **Wallets → Authorization keys → New key**.
   Copy the generated **Private key** into `server/.env` as `PRIVY_AUTHORIZATION_KEY` (it's a
   DER/PKCS8 base64 string, no PEM headers — Privy does not store it, so save it now). Note
   the key's **id** and set it in **both**:
   - `server/.env` → `PRIVY_AUTHORIZATION_KEY_ID`
   - `react/.env.local` → `VITE_PRIVY_AUTHORIZATION_KEY_ID` (public id only)
2. Also enable identity tokens (User management → Authentication → Advanced → "Return user
   data in an identity token") — needed for claim + agent.
3. Embedded-wallet-on-login is already configured in the SPA (Phase 1).

### Flow

1. Recipient claims a gift → their embedded wallet holds the USDC (Phase 1).
2. In the SPA (`/agent`), they click **Authorize agent** →
   `useSigners().addSigners({ address, signers: [{ signerId: <auth key id> }] })`, adding the
   app's authorization key as a **session signer** on their TEE wallet.
3. They chat an intent → `POST /api/agent`. Claude (tool use) may call `call_paid_service`,
   which runs the x402 loop signing via the session signer (authorization key in
   `authorization_context`), **within budget**.
4. The cap is enforced in three places: the tool pre-check, inside `spendViaX402`, and the
   ledger sum. The model can request a spend but never moves funds; an over-budget call is
   refused without paying.

### Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/agent` | access token + `privy-id-token` | run the agent (tool-use x402 spend) |
| `GET /api/budget` | access token | `{ cap, spent, remaining }` |

x402 payments use EIP-3009 (gasless for the payer), so the recipient wallet needs **no ETH** —
just the gifted USDC.

## x402 (Phase 0)

`pnpm x402:seller` + `pnpm x402:test` exercise the x402 payment loop. See `scripts/`.
