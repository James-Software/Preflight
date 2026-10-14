import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isLoginAllowed, addToWaitlist } from "@/lib/access";
import { claimInvite, INVITE_COOKIE } from "@/lib/invites";

// The GitHub numeric user id rides on the JWT as token.sub; the username
// rides as token.githubLogin. Both are exposed on the session so server
// code can scope database rows and gate admin pages to the caller.
declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string;
      githubLogin?: string;
    } & DefaultSession["user"];
  }
}

// GitHub-only login for now. JWT sessions mean no database tables are
// needed for auth itself — the session lives in an encrypted cookie.
// Required env: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_SECRET, AUTH_URL.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: {
    // Skip Auth.js's default sign-in page; /login goes straight to GitHub.
    signIn: "/login",
    error: "/access-denied",
  },
  callbacks: {
    // Invite-only by GitHub username. Email is NOT used: the GitHub App
    // user flow does not return private emails. A non-allowlisted sign-in
    // is recorded on the waitlist automatically, then denied.
    // Fails closed if the DB is unreachable.
    async signIn({ user, profile }) {
      const p = profile as
        | { login?: string; id?: number }
        | undefined;
      const login = p?.login?.toLowerCase().trim();
      if (!login) return false;
      try {
        if (await isLoginAllowed(login)) return true;
        // Invite claim: /invite/[code] drops a short-lived cookie with the
        // code before sending the user through GitHub OAuth. A valid claim
        // allowlists them immediately with referred = true.
        let inviteCode: string | undefined;
        try {
          const { cookies } = await import("next/headers");
          inviteCode = (await cookies()).get(INVITE_COOKIE)?.value;
        } catch {
          inviteCode = undefined;
        }
        if (inviteCode) {
          const claimed = await claimInvite(inviteCode, login);
          if (claimed) {
            try {
              const { cookies } = await import("next/headers");
              (await cookies()).delete(INVITE_COOKIE);
            } catch {
              // Non-fatal; the cookie expires on its own.
            }
            return true;
          }
        }
        await addToWaitlist({
          login,
          githubId: p?.id != null ? String(p.id) : null,
          name: user.name ?? null,
          avatarUrl: user.image ?? null,
        });
        return false;
      } catch {
        return false;
      }
    },
    async jwt({ token, profile, account }) {
      const t = token as unknown as Record<string, unknown>;
      const p = profile as { login?: string } | undefined;
      if (p?.login) {
        t.githubLogin = p.login.toLowerCase();
      }
      // Persist the GitHub user access token for server-side API calls
      // (repo listing, verification). It lives only in the encrypted JWT;
      // it is never copied onto the session, so it never reaches the browser.
      // Present on `account` at sign-in; the JWT keeps it across refreshes.
      if (account?.access_token) {
        t.githubAccessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.githubId = token.sub;
      }
      const gl = (token as unknown as Record<string, unknown>).githubLogin;
      if (typeof gl === "string") {
        session.user.githubLogin = gl;
      }
      return session;
    },
  },
});
