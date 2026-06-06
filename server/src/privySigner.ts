import { createPublicClient, http } from "viem";
import type { ClientEvmSigner } from "@x402/evm";
import { privy } from "./privy.js";
import { env, requirePrivyAuthorizationKey } from "./env.js";
import { getChainConfig } from "./chain.js";

const chain = getChainConfig(env.network);
const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(env.baseRpcUrl) });

/** viem-style EIP-712 typed data (what the x402 client hands us). */
interface ViemTypedData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Recursively convert bigint values to decimal strings so the payload is JSON-safe. */
function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

/** Standard EIP-712 domain field types, used to synthesize EIP712Domain if absent. */
const DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/**
 * Map viem-style typed data to Privy's `typed_data` shape:
 * - primaryType -> primary_type
 * - bigints -> strings
 * - ensure types.EIP712Domain exists (viem omits it; eth_signTypedData_v4 needs it)
 */
function toPrivyTypedData(td: ViemTypedData) {
  const types = { ...(td.types as Record<string, Array<{ name: string; type: string }>>) };
  if (!types.EIP712Domain) {
    types.EIP712Domain = Object.keys(td.domain)
      .filter((k) => k in DOMAIN_FIELD_TYPES && td.domain[k] !== undefined)
      .map((k) => ({ name: k, type: DOMAIN_FIELD_TYPES[k] }));
  }
  return {
    domain: jsonSafe(td.domain) as Record<string, unknown>,
    types,
    primary_type: td.primaryType,
    message: jsonSafe(td.message) as Record<string, unknown>,
  };
}

/**
 * Build an x402 ClientEvmSigner backed by a Privy delegated embedded wallet.
 * All signing happens server-side in Privy's TEE, authorized by the app's P-256
 * authorization key — the recipient never exposes a private key, and we never
 * hold one. This replaces the Phase 0 TEST_PRIVATE_KEY account.
 */
export function makePrivyDelegatedSigner(params: {
  walletId: string;
  address: `0x${string}`;
}): ClientEvmSigner {
  const authKey = requirePrivyAuthorizationKey();

  return {
    address: params.address,

    async signTypedData(message): Promise<`0x${string}`> {
      const typed_data = toPrivyTypedData(message as ViemTypedData);
      const res = await privy
        .wallets()
        .ethereum()
        .signTypedData(params.walletId, {
          params: { typed_data },
          authorization_context: { authorization_private_keys: [authKey] },
        });
      const sig = res.signature.startsWith("0x") ? res.signature : `0x${res.signature}`;
      return sig as `0x${string}`;
    },

    // Optional on-chain reads for x402 extension enrichment (EIP-2612 / approvals).
    // USDC on Base uses EIP-3009 (no approval), but we provide this for completeness.
    readContract(args) {
      return publicClient.readContract({
        address: args.address,
        abi: args.abi as never,
        functionName: args.functionName,
        args: args.args as never,
      });
    },
  };
}
