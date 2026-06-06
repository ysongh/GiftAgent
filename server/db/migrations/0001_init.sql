-- GiftAgent Phase 0 schema.
-- Three tables: gifts -> claims (1:1-ish per gift) and gifts -> ledger (spend log).
-- Schema only; no app logic / RLS policies yet (server uses the service-role key).

create extension if not exists "pgcrypto";

-- A sender gifts some USDC to a recipient email.
create table if not exists public.gifts (
  id              uuid primary key default gen_random_uuid(),
  sender          text        not null,              -- sender identifier (privy id / email / address)
  recipient_email text        not null,
  amount_usdc     numeric(20, 6) not null check (amount_usdc > 0),
  status          text        not null default 'pending'
                    check (status in ('pending', 'claimed', 'spent', 'refunded', 'cancelled')),
  created_at      timestamptz not null default now()
);

create index if not exists gifts_recipient_email_idx on public.gifts (recipient_email);
create index if not exists gifts_status_idx on public.gifts (status);

-- The recipient claims a gift via Privy, which provisions a wallet.
create table if not exists public.claims (
  id             uuid primary key default gen_random_uuid(),
  gift_id        uuid        not null references public.gifts (id) on delete cascade,
  privy_user_id  text        not null,
  wallet_address text        not null,
  claimed_at     timestamptz not null default now(),
  unique (gift_id)                                   -- a gift is claimed at most once
);

create index if not exists claims_privy_user_id_idx on public.claims (privy_user_id);

-- Each x402 spend made on the recipient's behalf is recorded here.
create table if not exists public.ledger (
  id          uuid primary key default gen_random_uuid(),
  gift_id     uuid        not null references public.gifts (id) on delete cascade,
  service     text        not null,                  -- which x402 service was paid
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  tx_hash     text,                                  -- settlement tx hash (nullable until settled)
  created_at  timestamptz not null default now()
);

create index if not exists ledger_gift_id_idx on public.ledger (gift_id);
