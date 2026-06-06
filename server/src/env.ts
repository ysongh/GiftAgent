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
};

export type Env = typeof env;
