import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import { env } from "../env.js";
import { supabase } from "../supabase.js";
import { requirePrivyAuth, type AuthedRequest } from "../middleware/auth.js";
import { profileFromIdentityToken } from "../privyUser.js";
import { getUsdcBalance, transferUsdcFromTreasury } from "../treasury.js";

export const giftsRouter = Router();

/** Mask a sender identifier for public display (keep a short, non-PII hint). */
function maskSender(sender: string): string {
  if (sender.includes("@")) {
    const [name, domain] = sender.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  // Privy DID or address: show a short suffix.
  return `${sender.slice(0, 10)}…${sender.slice(-4)}`;
}

/** Read the Privy identity token (carries the user profile) from its header. */
function getIdentityToken(req: AuthedRequest): string | null {
  const header = req.headers["privy-id-token"];
  return typeof header === "string" && header.length > 0 ? header : null;
}

// ── POST /api/gifts ──────────────────────────────────────────────────────────
// Create a gift: record it, generate a claim token, email the claim link.
// No money moves here — funding happens at claim time (fund-at-claim treasury).
giftsRouter.post("/", requirePrivyAuth, async (req: AuthedRequest, res: Response) => {
  const { recipient_email, amount_usdc } = req.body ?? {};

  const email = typeof recipient_email === "string" ? recipient_email.trim().toLowerCase() : "";
  const amount = Number(amount_usdc);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "recipient_email must be a valid email" });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount_usdc must be a positive number" });
  }
  if (amount > env.giftMaxUsdc) {
    return res.status(400).json({ error: `amount_usdc exceeds max of ${env.giftMaxUsdc}` });
  }

  const claimToken = randomBytes(24).toString("base64url");

  const { data: gift, error } = await supabase
    .from("gifts")
    .insert({
      sender: req.privy!.userId,
      recipient_email: email,
      amount_usdc: amount,
      status: "created",
      claim_token: claimToken,
    })
    .select("id, recipient_email, amount_usdc, status, created_at")
    .single();

  if (error || !gift) {
    console.error("[gifts] insert failed:", error);
    return res.status(500).json({ error: "Failed to create gift" });
  }

  const claimUrl = `${env.appBaseUrl}/claim/${claimToken}`;
  await import("../email.js").then(({ sendClaimEmail }) =>
    sendClaimEmail({ to: email, amountUsdc: amount, claimUrl }),
  );

  return res.status(201).json({ gift, claimUrl });
});

// ── GET /api/gifts/:token ────────────────────────────────────────────────────
// Token-gated, no auth: display info for the claim page.
giftsRouter.get("/:token", async (req, res: Response) => {
  const { token } = req.params;

  const { data: gift, error } = await supabase
    .from("gifts")
    .select("amount_usdc, status, sender, recipient_email, claim_tx_hash")
    .eq("claim_token", token)
    .maybeSingle();

  if (error) {
    console.error("[gifts] lookup failed:", error);
    return res.status(500).json({ error: "Lookup failed" });
  }
  if (!gift) {
    return res.status(404).json({ error: "Gift not found" });
  }

  return res.json({
    amountUsdc: Number(gift.amount_usdc),
    status: gift.status,
    sender: maskSender(gift.sender),
    alreadyClaimed: gift.status === "claimed",
    claimTxHash: gift.claim_tx_hash ?? null,
  });
});

// ── POST /api/gifts/:token/claim ─────────────────────────────────────────────
// Privy auth required. Verifies recipient, transfers USDC from treasury, records claim.
giftsRouter.post("/:token/claim", requirePrivyAuth, async (req: AuthedRequest, res: Response) => {
  const { token } = req.params;

  const idToken = getIdentityToken(req);
  if (!idToken) {
    return res.status(401).json({ error: "Missing privy-id-token header" });
  }

  // Resolve the recipient's email + embedded wallet from the verified identity token.
  let profile;
  try {
    profile = await profileFromIdentityToken(idToken);
  } catch (err) {
    console.error("[claim] identity token verification failed:", err);
    return res.status(401).json({ error: "Invalid identity token" });
  }

  // The identity token must belong to the same user as the access token.
  if (profile.userId !== req.privy!.userId) {
    return res.status(401).json({ error: "Token mismatch" });
  }
  if (!profile.email) {
    return res.status(400).json({ error: "Your account has no email on file" });
  }
  if (!profile.embeddedWalletAddress) {
    return res.status(400).json({ error: "No embedded wallet found for your account" });
  }

  // Look up the gift.
  const { data: gift, error: lookupErr } = await supabase
    .from("gifts")
    .select("id, recipient_email, amount_usdc, status")
    .eq("claim_token", token)
    .maybeSingle();

  if (lookupErr) {
    console.error("[claim] lookup failed:", lookupErr);
    return res.status(500).json({ error: "Lookup failed" });
  }
  if (!gift) {
    return res.status(404).json({ error: "Gift not found" });
  }

  // Recipient email must match the gift (case-insensitive).
  if (gift.recipient_email.toLowerCase() !== profile.email.toLowerCase()) {
    return res.status(403).json({
      error: "This gift was sent to a different email address",
    });
  }

  // Atomic claim lock: only one request can move 'created' -> 'claiming'.
  const { data: locked, error: lockErr } = await supabase
    .from("gifts")
    .update({ status: "claiming" })
    .eq("id", gift.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (lockErr) {
    console.error("[claim] lock failed:", lockErr);
    return res.status(500).json({ error: "Claim failed" });
  }
  if (!locked) {
    return res.status(409).json({ error: "Gift already claimed or in progress" });
  }

  const amount = Number(gift.amount_usdc);
  const wallet = profile.embeddedWalletAddress;

  // Transfer USDC from the treasury to the recipient's embedded wallet.
  let txHash: `0x${string}`;
  try {
    const result = await transferUsdcFromTreasury(wallet, amount);
    if (!result.confirmed) throw new Error(`tx ${result.txHash} did not confirm successfully`);
    txHash = result.txHash;
  } catch (err) {
    console.error("[claim] transfer failed, reverting lock:", err);
    // Release the lock so the recipient can retry.
    await supabase.from("gifts").update({ status: "created" }).eq("id", gift.id);
    return res.status(502).json({ error: "Treasury transfer failed; please try again" });
  }

  // Record the claim and finalize the gift. claims.gift_id is UNIQUE (one claim/gift).
  const { error: claimErr } = await supabase.from("claims").insert({
    gift_id: gift.id,
    privy_user_id: profile.userId,
    wallet_address: wallet,
  });
  if (claimErr) {
    // Transfer already succeeded; log but don't fail the user-visible result.
    console.error("[claim] claims insert failed (transfer already sent):", claimErr);
  }

  await supabase
    .from("gifts")
    .update({ status: "claimed", claim_tx_hash: txHash })
    .eq("id", gift.id);

  let balanceUsdc: string | null = null;
  try {
    balanceUsdc = await getUsdcBalance(wallet);
  } catch (err) {
    console.error("[claim] balance read failed:", err);
  }

  return res.json({ walletAddress: wallet, txHash, balanceUsdc, amountUsdc: amount });
});
