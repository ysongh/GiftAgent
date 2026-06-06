import { config } from "dotenv";

config();

/** Read a required env var, throwing a clear error if missing. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Read an optional env var with a fallback default. */
function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Server
  port: Number(optional("PORT", "4000")),
  // CORS: Vite dev origin is always allowed; prod origin is configurable.
  viteDevOrigin: optional("VITE_DEV_ORIGIN", "http://localhost:5173"),
  prodOrigin: process.env.PROD_ORIGIN, // optional

  // Privy (server-side token verification)
  privyAppId: required("PRIVY_APP_ID"),
  privyAppSecret: required("PRIVY_APP_SECRET"),

  // Supabase (server-side, service role)
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_KEY"),

  // Chain (Phase 1 gift/claim). Defaults to Base Sepolia testnet.
  network: optional("NETWORK", "base-sepolia"),
  baseRpcUrl: process.env.BASE_RPC_URL, // optional override for viem reads

  // Treasury (Privy server wallet that funds gifts on claim).
  treasuryWalletId: process.env.TREASURY_WALLET_ID,
  treasuryWalletAddress: process.env.TREASURY_WALLET_ADDRESS as `0x${string}` | undefined,
  // Whether to request Privy gas sponsorship for treasury transfers.
  // If false, the treasury wallet must hold native ETH for gas.
  treasuryGasSponsored: optional("TREASURY_GAS_SPONSORED", "false") === "true",

  // Gift limits + claim links.
  giftMaxUsdc: Number(optional("GIFT_MAX_USDC", "20")),
  // Public base URL of the SPA, used to build claim links.
  appBaseUrl: optional("APP_BASE_URL", "http://localhost:5173"),

  // Email (pluggable). Provider "resend" sends real mail; anything else logs only.
  emailProvider: optional("EMAIL_PROVIDER", "console"),
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: optional("EMAIL_FROM", "GiftAgent <onboarding@resend.dev>"),

  // Phase 2: delegated signing (Privy authorization key) + agent.
  // P-256 authorization private key from the Privy dashboard (DER/PKCS8 base64, no PEM headers).
  privyAuthorizationKey: process.env.PRIVY_AUTHORIZATION_KEY,
  privyAuthorizationKeyId: process.env.PRIVY_AUTHORIZATION_KEY_ID, // quorum/owner id (informational)

  // Anthropic agent.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-sonnet-4-6"),

  // The single x402 service the agent can spend against (Phase 2 scope).
  agentServiceUrl: optional("AGENT_SERVICE_URL", "http://localhost:4021/weather"),
  agentServiceName: optional("AGENT_SERVICE_NAME", "x402-test-weather"),
};

/** Authorization key, asserted present (used only on delegated-signing paths). */
export function requirePrivyAuthorizationKey(): string {
  if (!env.privyAuthorizationKey) {
    throw new Error(
      "PRIVY_AUTHORIZATION_KEY is not set. Create an authorization key in the Privy dashboard (Wallets → Authorization keys) and add it to .env.",
    );
  }
  return env.privyAuthorizationKey;
}

/** Anthropic API key, asserted present (used only on the agent route). */
export function requireAnthropicApiKey(): string {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return env.anthropicApiKey;
}

/** Treasury wallet id, asserted present (used only on routes that move money). */
export function requireTreasuryWalletId(): string {
  if (!env.treasuryWalletId) {
    throw new Error(
      "TREASURY_WALLET_ID is not set. Run `pnpm treasury:setup` to create the treasury wallet and add its id to .env.",
    );
  }
  return env.treasuryWalletId;
}

export type Env = typeof env;
