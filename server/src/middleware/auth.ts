import type { NextFunction, Request, Response } from "express";
import { privy } from "../privy.js";

/** Verified Privy claims attached to the request after auth. */
export interface AuthedRequest extends Request {
  privy?: {
    userId: string;
    appId: string;
    sessionId: string;
  };
}

/**
 * Reads the Privy access token from `Authorization: Bearer <token>` and verifies
 * it server-side. On success, attaches the verified user id to req.privy.
 * On failure, responds 401.
 */
export async function requirePrivyAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const accessToken = header.slice("Bearer ".length).trim();
  if (!accessToken) {
    res.status(401).json({ error: "Empty access token" });
    return;
  }

  try {
    const claims = await privy.utils().auth().verifyAccessToken(accessToken);
    req.privy = {
      userId: claims.user_id,
      appId: claims.app_id,
      sessionId: claims.session_id,
    };
    next();
  } catch (err) {
    console.error("[auth] token verification failed:", err);
    res.status(401).json({ error: "Invalid or expired access token" });
  }
}
