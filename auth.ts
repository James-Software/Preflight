import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isLoginAllowed, addToWaitlist } from "@/lib/access";

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
    async jwt({ token, profile }) {
      const p = profile as { login?: string } | undefined;
      if (p?.login) {
        (token as unknown as Record<string, unknown>).githubLogin =
          p.login.toLowerCase();
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
