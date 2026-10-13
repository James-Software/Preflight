import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isEmailAllowed } from "@/lib/allowlist";

// The GitHub numeric user id rides on the JWT as token.sub. Expose it on
// the session so server code can scope database rows to the caller.
declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string;
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
    // Invite-only: deny the sign-in unless the GitHub email is on the
    // allowed_emails list. Fails closed if the DB is unreachable.
    // TEMP DEBUG: logs the email GitHub returns (remove after diagnosing).
    async signIn({ user, profile }) {
      const login = (profile as { login?: string } | undefined)?.login ?? "(unknown)";
      const email = user.email?.toLowerCase().trim();
      console.log(`[auth-debug] signIn: login=${login} email=${email ?? "(none)"}`);
      if (!email) {
        console.log("[auth-debug] denied: no email from GitHub");
        return false;
      }
      try {
        const allowed = await isEmailAllowed(email);
        console.log(`[auth-debug] ${allowed ? "allowed" : "denied"}: ${email}`);
        return allowed;
      } catch (e) {
        console.log(`[auth-debug] denied (db error): ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    // Copy the GitHub user id from the JWT onto the session.
    async session({ session, token }) {
      if (token.sub) {
        session.user.githubId = token.sub;
      }
      return session;
    },
  },
});
