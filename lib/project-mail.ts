import { SITE_URL } from "@/lib/site";
export class ProjectInviteError extends Error {}
export function assertInviteMailConfigured() {
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.INVITE_FROM_EMAIL?.trim())
    throw new ProjectInviteError("Email invitations need RESEND_API_KEY and INVITE_FROM_EMAIL in Vercel. Use a sender verified in Resend.");
}
export async function sendProjectMail(to: string, subject: string, text: string, id: string) {
  assertInviteMailConfigured();
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify({ from: process.env.INVITE_FROM_EMAIL!.trim(), to: [to], subject,
        text: `${text}\n\nPreFlight · ${SITE_URL}\nIf you weren't expecting this invitation, you can ignore this email.` }),
    });
  } catch { throw new ProjectInviteError("The invitation email could not be sent. Try again shortly."); }
  if (!response.ok) throw new ProjectInviteError(response.status === 429
    ? "The email sending limit was reached. Try again later."
    : "Email delivery was rejected. Check the verified sender and Resend configuration.");
  const data = await response.json().catch(() => null);
  if (typeof data?.id !== "string") throw new ProjectInviteError("Email delivery could not be confirmed. Try again shortly.");
}
