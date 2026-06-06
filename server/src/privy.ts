import { PrivyClient } from "@privy-io/node";
import { env } from "./env.js";

/**
 * Server-side Privy client. Used to verify access tokens issued to the SPA.
 * Verification uses the app id + app secret (never expose the secret client-side).
 */
export const privy = new PrivyClient({
  appId: env.privyAppId,
  appSecret: env.privyAppSecret,
});
