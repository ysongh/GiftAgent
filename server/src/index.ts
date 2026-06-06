import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { requirePrivyAuth, type AuthedRequest } from "./middleware/auth.js";
import { giftsRouter } from "./routes/gifts.js";

const app = express();

// CORS: allow the Vite dev origin plus an optional configurable production origin.
const allowedOrigins = [env.viteDevOrigin, env.prodOrigin].filter(
  (o): o is string => Boolean(o),
);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

// Health check (unauthenticated).
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "giftagent-server" });
});

// Protected route: proves the SPA -> API -> Privy verification chain.
app.get("/api/me", requirePrivyAuth, (req: AuthedRequest, res) => {
  res.json({ userId: req.privy!.userId });
});

// Phase 1: gift + claim flow.
app.use("/api/gifts", giftsRouter);

app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
  console.log(`[server] CORS allowed origins: ${allowedOrigins.join(", ")}`);
});
