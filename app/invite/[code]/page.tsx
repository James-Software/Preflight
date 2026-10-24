import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getInviteByCode, INVITE_COOKIE } from "@/lib/invites";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const invite = await getInviteByCode(code);

  async function accept() {
    "use server";
    (await cookies()).set(INVITE_COOKIE, code, {
      httpOnly: true,
      maxAge: 3600,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    redirect("/login");
  }

  if (!invite) {
    return (
      <main className="flex min-h-svh items-center justify-center pb-16 pt-28 px-6 bg-page">
        <div className="max-w-sm text-center">
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink dark:text-white">
            This invite link is not valid
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted dark:text-muted">
            It may have been fully claimed or revoked. Ask the person who sent
            it for a fresh link, or join the waitlist instead.
          </p>
          <a
            href="/#early-access"
            className="pressable btn-primary mt-8 inline-block rounded-full px-6 py-3 text-sm font-medium text-white"
          >
            Join the waitlist
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center pb-16 pt-28 px-6 bg-page">
      <div className="max-w-sm text-center">
        <h1 className="font-sans mt-4 text-2xl font-semibold tracking-tight text-ink dark:text-white">
          You are invited to PreFlight
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted dark:text-muted">
          <span className="font-medium text-ink dark:text-white">
            @{invite.inviterLogin}
          </span>{" "}
          invited you to skip the waitlist. Join with GitHub to claim your spot.
        </p>
        <form action={accept}>
          <button
            type="submit"
            className="pressable btn-primary mt-8 inline-flex cursor-pointer items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Join with GitHub
          </button>
        </form>
        <p className="mt-4 text-xs text-muted dark:text-muted">
          {invite.remaining} of 3 invites remaining on this link.
        </p>
      </div>
    </main>
  );
}
