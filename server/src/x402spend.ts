import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { getChainConfig, USDC_DECIMALS } from "./chain.js";

export interface X402Quote {
  /** Price in USDC (decimal), 0 if the endpoint is free / not 402-gated. */
  priceUsdc: number;
  /** Decoded x402 v2 payment requirements (null if not 402). */
  requirements: unknown;
}

/**
 * Probe an x402 endpoint and read the required price WITHOUT paying. In x402 v2
 * the requirements travel in the base64 PAYMENT-REQUIRED response header.
 */
export async function quoteX402(targetUrl: string, network: string): Promise<X402Quote> {
  const probe = await fetch(targetUrl, { method: "GET" });
  if (probe.status !== 402) return { priceUsdc: 0, requirements: null };

  const header = probe.headers.get("payment-required");
  if (!header) return { priceUsdc: 0, requirements: null };

  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
    accepts?: Array<{ network: string; amount: string }>;
  };
  const caip2 = getChainConfig(network).caip2;
  const accepts = decoded.accepts ?? [];
  const match = accepts.find((a) => a.network === caip2) ?? accepts[0];
  const priceUsdc = match ? Number(match.amount) / 10 ** USDC_DECIMALS : 0;
  return { priceUsdc, requirements: decoded };
}

export type SpendResult =
  | { ok: true; result: unknown; amountUsdc: number; txHash: string | null }
  | { ok: false; reason: "over_budget"; priceUsdc: number; remaining: number };

/**
 * Run the full x402 v2 payment loop (402 -> sign EIP-3009 -> retry -> 200) using
 * the supplied signer as the payer, but ONLY if the price is within `maxAmountUsdc`.
 *
 * The cap is enforced here too (defense in depth): if the quoted price exceeds the
 * budget, we refuse before any signing or payment happens.
 */
export async function spendViaX402(params: {
  signer: ClientEvmSigner;
  targetUrl: string;
  network: string;
  maxAmountUsdc: number;
  rpcUrl?: string;
}): Promise<SpendResult> {
  const { signer, targetUrl, network, maxAmountUsdc, rpcUrl } = params;

  const { priceUsdc } = await quoteX402(targetUrl, network);
  if (priceUsdc > maxAmountUsdc) {
    return { ok: false, reason: "over_budget", priceUsdc, remaining: maxAmountUsdc };
  }

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer, rpcUrl ? { rpcUrl } : undefined));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  const response = await fetchWithPayment(targetUrl, { method: "GET" });
  const contentType = response.headers.get("content-type") ?? "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`x402 call failed with status ${response.status}`);
  }

  // Read the settlement tx hash (only present when a payment was actually made).
  let txHash: string | null = null;
  try {
    const settle = httpClient.getPaymentSettleResponse((name) => response.headers.get(name)) as {
      transaction?: string;
      txHash?: string;
    } | null;
    txHash = settle?.transaction ?? settle?.txHash ?? null;
  } catch {
    txHash = null; // free endpoint or no settlement header
  }

  return { ok: true, result, amountUsdc: priceUsdc, txHash };
}
