/**
 * Treasury setup + status. Creates the Privy server wallet that funds gifts
 * (once), or — if TREASURY_WALLET_ID is already set — prints its address and
 * balances so you know how much to fund.
 *
 * Run:  pnpm treasury:setup
 *
 * After first run, copy the printed TREASURY_WALLET_ID into .env, then fund the
 * printed address with testnet USDC (and a little ETH for gas unless you've
 * enabled Privy gas sponsorship — see README).
 */
import { config } from "dotenv";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";
import { privy } from "../src/privy.js";
import { env } from "../src/env.js";
import { getChainConfig, USDC_DECIMALS } from "../src/chain.js";

config();

const chain = getChainConfig(env.network);

async function main() {
  let walletId = env.treasuryWalletId;
  let address: `0x${string}`;

  if (!walletId) {
    console.log(`Creating a new Ethereum treasury wallet on ${chain.network}…`);
    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      display_name: "GiftAgent Treasury",
    });
    walletId = wallet.id;
    address = wallet.address as `0x${string}`;
    console.log("\n✅ Treasury wallet created.");
    console.log("   Add BOTH of these to your .env:");
    console.log(`   TREASURY_WALLET_ID=${walletId}`);
    console.log(`   TREASURY_WALLET_ADDRESS=${address}`);
  } else {
    if (!env.treasuryWalletAddress) {
      console.error(
        "TREASURY_WALLET_ID is set but TREASURY_WALLET_ADDRESS is missing. Add the wallet's address to .env (printed when it was created).",
      );
      process.exit(1);
    }
    address = env.treasuryWalletAddress;
    console.log(`Treasury wallet (${walletId}) already configured.`);
  }

  console.log(`\nTreasury address: ${address}`);
  console.log(`Network: ${chain.network} (${chain.caip2})`);
  console.log(`USDC contract: ${chain.usdcAddress}`);

  // Balances.
  const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(env.baseRpcUrl) });
  const [usdc, eth] = await Promise.all([
    publicClient.readContract({
      address: chain.usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    publicClient.getBalance({ address }),
  ]);

  console.log(`\nUSDC balance: ${formatUnits(usdc, USDC_DECIMALS)} USDC`);
  console.log(`ETH balance:  ${formatEther(eth)} ETH`);
  console.log(`Gas sponsorship: ${env.treasuryGasSponsored ? "enabled (sponsor=true)" : "disabled — wallet pays gas in ETH"}`);

  if (usdc === 0n) {
    console.log(`\n⚠️  Fund the treasury with USDC to enable claims.`);
    if (chain.network === "base-sepolia") {
      console.log(`   Base Sepolia USDC faucet: https://faucet.circle.com`);
    }
  }
  if (!env.treasuryGasSponsored && eth === 0n) {
    console.log(`⚠️  No ETH for gas. Fund with a little Base ${chain.network === "base-sepolia" ? "Sepolia " : ""}ETH, or enable gas sponsorship.`);
  }
}

main().catch((err) => {
  console.error("treasury setup failed:", err);
  process.exit(1);
});
