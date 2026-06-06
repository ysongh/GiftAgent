import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

/**
 * Network configuration, keyed by the NETWORK env var. Keep everything that
 * differs between testnet and mainnet here so flipping networks is one env change.
 *
 * USDC addresses are Circle's official tokens (developers.circle.com).
 */
export interface ChainConfig {
  /** Friendly network id used in env + Privy transfer chain naming. */
  network: "base-sepolia" | "base";
  /** CAIP-2 chain id used by Privy sendTransaction. */
  caip2: `eip155:${number}`;
  /** Numeric EVM chain id. */
  chainId: number;
  /** Official Circle USDC contract on this network. */
  usdcAddress: `0x${string}`;
  /** viem chain (for public reads: balances, receipts). */
  viemChain: Chain;
}

const CONFIGS: Record<string, ChainConfig> = {
  "base-sepolia": {
    network: "base-sepolia",
    caip2: "eip155:84532",
    chainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    viemChain: baseSepolia,
  },
  base: {
    network: "base",
    caip2: "eip155:8453",
    chainId: 8453,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    viemChain: base,
  },
};

/** Resolve the active chain config from a network id (defaults to base-sepolia). */
export function getChainConfig(network: string | undefined): ChainConfig {
  const key = network ?? "base-sepolia";
  const cfg = CONFIGS[key];
  if (!cfg) {
    throw new Error(`Unsupported NETWORK "${key}". Use one of: ${Object.keys(CONFIGS).join(", ")}`);
  }
  return cfg;
}

/** USDC has 6 decimals on all supported networks. */
export const USDC_DECIMALS = 6;
