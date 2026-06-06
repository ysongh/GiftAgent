/**
 * Tiny x402 v2 SELLER on Base Sepolia, used only to exercise the client loop in
 * scripts/x402-test.ts (Step A). It charges $0.001 USDC for GET /weather and uses
 * the testnet facilitator (FACILITATOR_URL) to verify + settle payments.
 *
 * Run:  pnpm x402:seller     (leave running, then run pnpm x402:test in another shell)
 */
import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { privateKeyToAccount } from "viem/accounts";

config();

const BASE_SEPOLIA = "eip155:84532";
const PORT = Number(process.env.SELLER_PORT ?? "4021");

const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// payTo defaults to the test account's own address so the script is self-contained.
const payTo =
  (process.env.SELLER_PAY_TO as `0x${string}` | undefined) ??
  (process.env.TEST_PRIVATE_KEY
    ? privateKeyToAccount(process.env.TEST_PRIVATE_KEY as `0x${string}`).address
    : undefined);

if (!payTo) {
  console.error("Set SELLER_PAY_TO or TEST_PRIVATE_KEY so the seller has a payTo address.");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: BASE_SEPOLIA,
            payTo,
          },
        ],
        description: "Weather data (x402 test seller)",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(BASE_SEPOLIA, new ExactEvmScheme()),
  ),
);

app.get("/weather", (_req, res) => {
  res.send({ report: { weather: "sunny", temperature: 70 } });
});

app.listen(PORT, () => {
  console.log(`[test-seller] listening at http://localhost:${PORT}`);
  console.log(`[test-seller] facilitator: ${facilitatorUrl}`);
  console.log(`[test-seller] payTo: ${payTo} on ${BASE_SEPOLIA}`);
});
