import { supabase } from "./supabase.js";

export interface Budget {
  giftId: string;
  cap: number;
  spent: number;
  remaining: number;
}

/**
 * The active gift for a user is the gift they claimed. The cap is that gift's
 * amount; spent is the sum of ledger rows for it; remaining is the difference.
 * Returns null if the user has no claimed gift.
 */
export async function getBudgetForUser(privyUserId: string): Promise<Budget | null> {
  // Most recent claim for this user -> its gift.
  const { data: claim, error: claimErr } = await supabase
    .from("claims")
    .select("gift_id")
    .eq("privy_user_id", privyUserId)
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (claimErr) throw new Error(`budget: claim lookup failed: ${claimErr.message}`);
  if (!claim) return null;

  const giftId = claim.gift_id as string;

  const { data: gift, error: giftErr } = await supabase
    .from("gifts")
    .select("amount_usdc")
    .eq("id", giftId)
    .maybeSingle();
  if (giftErr || !gift) throw new Error(`budget: gift lookup failed`);

  const cap = Number(gift.amount_usdc);

  const { data: rows, error: ledgerErr } = await supabase
    .from("ledger")
    .select("amount_usdc")
    .eq("gift_id", giftId);
  if (ledgerErr) throw new Error(`budget: ledger lookup failed: ${ledgerErr.message}`);

  const spent = (rows ?? []).reduce((sum, r) => sum + Number(r.amount_usdc), 0);
  const remaining = Math.max(0, cap - spent);

  return { giftId, cap, spent, remaining };
}

/** Record a successful paid call against a gift's budget. */
export async function recordSpend(params: {
  giftId: string;
  service: string;
  amountUsdc: number;
  txHash: string | null;
}): Promise<void> {
  const { error } = await supabase.from("ledger").insert({
    gift_id: params.giftId,
    service: params.service,
    amount_usdc: params.amountUsdc,
    tx_hash: params.txHash,
  });
  if (error) throw new Error(`budget: failed to record spend: ${error.message}`);
}
