import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { privy } from "./privy.js";
import { env, requireTreasuryWalletId } from "./env.js";
import { getChainConfig, USDC_DECIMALS } from "./chain.js";

const chain = getChainConfig(env.network);

/** Public client for on-chain reads (balances, receipts). */
const publicClient = createPublicClient({
  chain: chain.viemChain,
  transport: http(env.baseRpcUrl),
});

/** Read a wallet's USDC balance as a decimal string (e.g. "5.000000"). */
export async function getUsdcBalance(address: `0x${string}`): Promise<string> {
  const raw = await publicClient.readContract({
    address: chain.usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return formatUnits(raw, USDC_DECIMALS);
}

export interface TransferResult {
  txHash: `0x${string}`;
  confirmed: boolean;
}

/**
 * Transfer `amountUsdc` (decimal string/number) of USDC from the treasury server
 * wallet to `to`, by having Privy sign + broadcast a raw ERC-20 transfer. Waits
 * for the receipt and verifies success.
 *
 * All signing happens server-side via the treasury wallet; the caller supplies
 * only the (server-derived) recipient address and amount.
 */
export async function transferUsdcFromTreasury(
  to: `0x${string}`,
  amountUsdc: number | string,
): Promise<TransferResult> {
  const walletId = requireTreasuryWalletId();
  const value = parseUnits(String(amountUsdc), USDC_DECIMALS);

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, value],
  });

  const result = await privy
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2: chain.caip2,
      sponsor: env.treasuryGasSponsored,
      params: {
        transaction: {
          to: chain.usdcAddress,
          data,
          value: "0x0",
        },
      },
    });

  const txHash = result.hash as `0x${string}`;

  // Confirm settlement on-chain so we only mark gifts claimed on real success.
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, confirmed: receipt.status === "success" };
}

export { chain as treasuryChain };
