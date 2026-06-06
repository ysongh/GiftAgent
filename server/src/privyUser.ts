import { privy } from "./privy.js";

export interface RecipientProfile {
  userId: string;
  email: string | null;
  embeddedWalletAddress: `0x${string}` | null;
}

/**
 * Verify a Privy identity token (cryptographically, no network call) and extract
 * the user's email and Ethereum embedded wallet address from their linked accounts.
 *
 * We never trust client-supplied emails or addresses — both come from the verified
 * token's user object.
 */
export async function profileFromIdentityToken(idToken: string): Promise<RecipientProfile> {
  const user = await privy.utils().auth().verifyIdentityToken(idToken);

  let email: string | null = null;
  let embeddedWalletAddress: `0x${string}` | null = null;

  for (const account of user.linked_accounts) {
    if (account.type === "email" && !email) {
      email = account.address;
    }
    // Ethereum embedded (Privy) wallet — the one created at login.
    if (
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === "ethereum" &&
      "connector_type" in account &&
      account.connector_type === "embedded"
    ) {
      embeddedWalletAddress = account.address as `0x${string}`;
    }
  }

  return { userId: user.id, email, embeddedWalletAddress };
}
