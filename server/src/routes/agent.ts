import Anthropic from "@anthropic-ai/sdk";
import { Router, type Response } from "express";
import { env, requireAnthropicApiKey } from "../env.js";
import { requirePrivyAuth, type AuthedRequest } from "../middleware/auth.js";
import { profileFromIdentityToken } from "../privyUser.js";
import { makePrivyDelegatedSigner } from "../privySigner.js";
import { spendViaX402 } from "../x402spend.js";
import { getBudgetForUser, recordSpend } from "../budget.js";

export const agentRouter = Router();

const MAX_TOOL_ITERATIONS = 8;

function getIdentityToken(req: AuthedRequest): string | null {
  const header = req.headers["privy-id-token"];
  return typeof header === "string" && header.length > 0 ? header : null;
}

// ── GET /api/budget ──────────────────────────────────────────────────────────
agentRouter.get("/budget", requirePrivyAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const budget = await getBudgetForUser(req.privy!.userId);
    if (!budget) return res.status(404).json({ error: "No claimed gift found" });
    return res.json({ cap: budget.cap, spent: budget.spent, remaining: budget.remaining });
  } catch (err) {
    console.error("[budget] failed:", err);
    return res.status(500).json({ error: "Failed to compute budget" });
  }
});

interface Spend {
  service: string;
  cost: number;
  txHash: string | null;
}

// ── POST /api/agent ──────────────────────────────────────────────────────────
// Anthropic tool-use loop. The model can request a paid call; only the server
// executes payment, and only within the gift's remaining budget.
agentRouter.post("/agent", requirePrivyAuth, async (req: AuthedRequest, res: Response) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });

  // Resolve the recipient's delegated embedded wallet from the verified identity token.
  const idToken = getIdentityToken(req);
  if (!idToken) return res.status(401).json({ error: "Missing privy-id-token header" });

  let profile;
  try {
    profile = await profileFromIdentityToken(idToken);
  } catch {
    return res.status(401).json({ error: "Invalid identity token" });
  }
  if (profile.userId !== req.privy!.userId) {
    return res.status(401).json({ error: "Token mismatch" });
  }
  if (!profile.embeddedWalletId || !profile.embeddedWalletAddress) {
    return res.status(400).json({ error: "No embedded wallet found" });
  }
  if (!profile.delegated) {
    return res.status(403).json({ error: "Wallet not delegated. Authorize the agent first." });
  }

  const budget = await getBudgetForUser(req.privy!.userId);
  if (!budget) return res.status(400).json({ error: "No claimed gift to spend" });

  const signer = makePrivyDelegatedSigner({
    walletId: profile.embeddedWalletId,
    address: profile.embeddedWalletAddress,
  });

  const anthropic = new Anthropic({ apiKey: requireAnthropicApiKey() });
  const spends: Spend[] = [];

  // Tool handler: spend within the (freshly-read) remaining budget.
  async function callPaidService(input: string) {
    const current = await getBudgetForUser(req.privy!.userId);
    const remaining = current?.remaining ?? 0;
    const giftId = current?.giftId;

    const spend = await spendViaX402({
      signer,
      targetUrl: env.agentServiceUrl,
      network: env.network,
      maxAmountUsdc: remaining,
      rpcUrl: env.baseRpcUrl,
    });

    if (!spend.ok) {
      return {
        paid: false,
        refused: true,
        reason: "over_budget",
        price: spend.priceUsdc,
        remaining,
        note: "The service costs more than the remaining budget. Payment was refused.",
      };
    }

    if (giftId) {
      await recordSpend({
        giftId,
        service: env.agentServiceName,
        amountUsdc: spend.amountUsdc,
        txHash: spend.txHash,
      });
    }
    spends.push({ service: env.agentServiceName, cost: spend.amountUsdc, txHash: spend.txHash });
    const after = await getBudgetForUser(req.privy!.userId);

    return {
      paid: true,
      result: spend.result,
      cost: spend.amountUsdc,
      txHash: spend.txHash,
      remaining: after?.remaining ?? 0,
      requestInput: input,
    };
  }

  const tools: Anthropic.Tool[] = [
    {
      name: "call_paid_service",
      description:
        `Call the configured paid x402 service ("${env.agentServiceName}") on the user's behalf. ` +
        "The server pays from the user's gifted USDC budget and enforces a hard cap — if the price " +
        "exceeds the remaining budget the call is refused and no payment is made. Returns the service " +
        "result (when paid), the cost, and the remaining budget.",
      input_schema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input/query to send to the service." },
        },
        required: ["input"],
      },
    },
  ];

  const system =
    "You are a spending agent acting for a user who has a fixed USDC budget (their gift). " +
    "You can call a paid service via the call_paid_service tool. Spend only when it genuinely " +
    "serves the user's request. The tool enforces a hard budget cap server-side: you can request a " +
    "spend but you never move funds yourself, and a call that would exceed the budget is refused. " +
    "If a call is refused for budget reasons, explain that to the user gracefully and do not retry it. " +
    `The user's remaining budget is currently ${budget.remaining} USDC (cap ${budget.cap}).`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
  let replyText = "";

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await anthropic.messages.create({
        model: env.anthropicModel,
        max_tokens: 1024,
        system,
        tools,
        messages,
      });

      replyText = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (resp.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use" && block.name === "call_paid_service") {
          const input = (block.input as { input?: string })?.input ?? "";
          const out = await callPaidService(input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out),
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    console.error("[agent] loop error:", err);
    return res.status(500).json({ error: "Agent failed", detail: String(err) });
  }

  const finalBudget = await getBudgetForUser(req.privy!.userId);
  return res.json({
    reply: replyText,
    spends,
    remaining: finalBudget?.remaining ?? budget.remaining,
  });
});
