/**
 * KEYSTONE: isolate and prove the x402 v2 payment loop server-side.
 *
 * Uses the v2 CLIENT packages (@x402/fetch + @x402/core + @x402/evm) with a plain
 * EVM account from TEST_PRIVATE_KEY as the payer (later replaced by Privy delegated
 * signing).
 *
 *   Step A (testnet, Base Sepolia): full 402 -> sign USDC -> retry -> 200 + body loop
 *           against the local test seller (scripts/test-seller.ts).
 *   Step B (mainnet, Base): ONE real call to an agentic.market x402 service to confirm
 *           real settlement. Configured via X402_MAINNET_URL.
 *
 * Run:  pnpm x402:seller   (in one shell, for Step A)
 *       pnpm x402:test     (in another)
 *
 * Flags: pass `--step=a` or `--step=b` to run only one step (default: both).
 */
import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

config();

const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY as `0x${string}` | undefined;
const BASE_RPC_URL = process.env.BASE_RPC_URL;

const TESTNET_URL = process.env.X402_TEST_URL ?? "http://localhost:4021/weather";
const MAINNET_URL = process.env.X402_MAINNET_URL;

if (!TEST_PRIVATE_KEY) {
  console.error("❌ TEST_PRIVATE_KEY is required.");
  process.exit(1);
}

const stepArg = process.argv.find((a) => a.startsWith("--step="))?.split("=")[1];
const runA = !stepArg || stepArg === "a";
const runB = !stepArg || stepArg === "b";

const payerAddress = privateKeyToAccount(TEST_PRIVATE_KEY).address;

/** Build a payment-aware fetch wrapper backed by the EVM signer. */
function makePaidFetch() {
  const signer = privateKeyToAccount(TEST_PRIVATE_KEY!);
  const rpcOptions = BASE_RPC_URL ? { rpcUrl: BASE_RPC_URL } : undefined;

  const client = new x402Client();
  // "eip155:*" matches all EVM chains (Base Sepolia + Base mainnet).
  client.register("eip155:*", new ExactEvmScheme(signer, rpcOptions));

  console.log(`Payer address: ${signer.address}`);
  return {
    fetchWithPayment: wrapFetchWithPayment(fetch, client),
    httpClient: new x402HTTPClient(client),
  };
}

/** Make one request through the paid fetch and log the 402/payment/result. */
async function paidCall(label: string, url: string) {
  const { fetchWithPayment, httpClient } = makePaidFetch();

  console.log(`\n=== ${label} ===`);
  console.log(`GET ${url}`);

  // Peek at the raw 402 first so we can log the payment requirements. In x402 v2
  // the requirements travel in the base64-encoded PAYMENT-REQUIRED response header.
  const probe = await fetch(url, { method: "GET" });
  console.log(`Initial status: ${probe.status}`);
  if (probe.status === 402) {
    const header = probe.headers.get("payment-required");
    if (header) {
      const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
      console.log("402 payment requirements:", JSON.stringify(decoded, null, 2));
    } else {
      console.log("402 body:", await probe.clone().text());
    }
  }

  // Now do the real paid request (sign USDC -> retry -> 200).
  const response = await fetchWithPayment(url, { method: "GET" });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  console.log(`Final status: ${response.status}`);
  console.log("Response body:", body);

  if (response.status === 402) {
    throw new Error(
      `${label}: still 402 after signing — the payment was not settled. ` +
        `Most likely the payer (${payerAddress}) has no USDC on this network. ` +
        `Fund TEST_PRIVATE_KEY with USDC (Base Sepolia faucet for Step A) and retry.`,
    );
  }

  const settle = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
  console.log("Payment settle response:", JSON.stringify(settle, null, 2));
  const txHash =
    (settle as { transaction?: string; txHash?: string } | null)?.transaction ??
    (settle as { txHash?: string } | null)?.txHash;
  if (txHash) console.log(`✅ tx hash: ${txHash}`);

  if (!response.ok) throw new Error(`${label} failed with status ${response.status}`);
  console.log(`✅ ${label} succeeded`);
}

async function main() {
  if (runA) {
    await paidCall("STEP A — Base Sepolia testnet loop", TESTNET_URL);
  }

  if (runB) {
    if (!MAINNET_URL) {
      console.log(
        "\n⏭  STEP B skipped: set X402_MAINNET_URL to a real agentic.market service to run the real mainnet call.",
      );
    } else {
      await paidCall("STEP B — Base mainnet real settlement", MAINNET_URL);
    }
  }

  console.log("\n🎉 x402 keystone complete.");
}

main().catch((err) => {
  console.error("\n❌ x402 test failed:", err?.response?.data?.error ?? err);
  process.exit(1);
});
