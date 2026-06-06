-- Phase 1: gift + claim flow additions to the gifts table.
-- Adds an unguessable claim token, the settlement tx hash, and widens the
-- status lifecycle to include 'created' (initial) and 'claiming' (in-flight lock).

alter table public.gifts
  add column if not exists claim_token   text,
  add column if not exists claim_tx_hash text;

-- Unguessable token is unique and used as the claim URL key.
create unique index if not exists gifts_claim_token_idx on public.gifts (claim_token);

-- Default new gifts to 'created' (no money moved yet).
alter table public.gifts alter column status set default 'created';

-- Widen the status check to the Phase 1 lifecycle.
alter table public.gifts drop constraint if exists gifts_status_check;
alter table public.gifts
  add constraint gifts_status_check
  check (status in ('created', 'pending', 'claiming', 'claimed', 'spent', 'refunded', 'cancelled'));
