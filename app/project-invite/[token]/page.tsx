import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { projectInviteInfo, PROJECT_INVITE_COOKIE } from "@/lib/project-collaboration";
import AcceptProjectInvite from "@/components/AcceptProjectInvite";
export default async function ProjectInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await projectInviteInfo(token);
  const user = (await auth())?.user;
  const usable = invite && (invite.status === "pending" || invite.accepted_by === user?.githubId);
  async function signIn() {
    "use server";
    if (!(await projectInviteInfo(token))) redirect(`/project-invite/${token}`);
    (await cookies()).set(PROJECT_INVITE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
    redirect(`/login?reauth=github&callbackUrl=${encodeURIComponent(`/project-invite/${token}`)}`);
  }
  const email = invite ? `${invite.email.slice(0, 1)}***@${invite.email.split("@")[1]}` : "";
  return <main className="flex min-h-svh items-center justify-center bg-page px-6 pb-16 pt-28"><div className="w-full max-w-sm">
    <h1 className="text-2xl font-semibold tracking-tight">{usable ? `Join ${invite.project_name}` : "This invitation is no longer available"}</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted">{usable ? "Run tests together, review findings and open fix pull requests using the project’s connected repository." : "It may have expired, been accepted or been revoked. Ask the project owner for a new invitation."}</p>
    {usable && (user?.githubId && user.githubLogin && !user.isTestUser
      ? <AcceptProjectInvite token={token} login={user.githubLogin} email={email} />
      : <form action={signIn}><button type="submit" className="pressable btn-primary mt-7 min-h-11 w-full rounded-lg px-5 text-sm font-medium text-white">Continue with GitHub</button></form>)}
  </div></main>;
}
