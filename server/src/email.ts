import { env } from "./env.js";

export interface ClaimEmail {
  to: string;
  amountUsdc: number;
  claimUrl: string;
}

/**
 * Pluggable email sender. Default provider "resend" sends real mail when
 * RESEND_API_KEY is set; otherwise (or on any failure) we always log the claim
 * link to the server console so the demo works with no email configured.
 */
export async function sendClaimEmail({ to, amountUsdc, claimUrl }: ClaimEmail): Promise<void> {
  // ALWAYS log — this is the no-email-needed demo path.
  console.log(
    `\n[email] Gift claim link for ${to} ($${amountUsdc} USDC):\n  ${claimUrl}\n`,
  );

  if (env.emailProvider !== "resend" || !env.resendApiKey) {
    return; // console-only mode
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to,
        subject: `You've been gifted $${amountUsdc} in USDC`,
        html:
          `<p>Someone sent you <strong>$${amountUsdc} USDC</strong>.</p>` +
          `<p><a href="${claimUrl}">Click here to claim it</a> — just log in with this email address.</p>`,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend failed (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error("[email] Resend request error:", err);
  }
}
