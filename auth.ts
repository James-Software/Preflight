import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import {
  savedGithubOwner,
  saveGithubCredentials,
} from "@/lib/github-credentials";
import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isLoginAllowed, addToWaitlist } from "@/lib/access";
import { claimInvite, INVITE_COOKIE } from "@/lib/invites";

// token.sub is a stable app owner linked to GitHub's numeric account ID.
// Existing signed-in owners are retained when linking legacy sessions.
// The username supports ownership checks and admin navigation.
declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string;
      githubLogin?: string;
    } & DefaultSession["user"];
  }
}

// App sessions use encrypted JWT cookies. GitHub's rotating connection
// credentials live encrypted on the server so requests can renew them together.
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
      const p = profile as { login?: string; id?: number } | undefined;
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
        return "/access-denied?reason=waitlist";
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
      if (account?.access_token) {
        const providerId = String(account.providerAccountId || "");
        let owner = await savedGithubOwner(providerId);
        if (!owner) {
          // Older Auth.js sessions can use a random app ID. Keep the current
          // signed-in owner's projects when linking their same GitHub account.
          const previous = await getToken({
            req: { headers: await headers() },
            secret: process.env.AUTH_SECRET,
            secureCookie: process.env.NODE_ENV === "production",
          });
          const sameAccount =
            previous?.githubProviderId === providerId ||
            (!previous?.githubProviderId &&
              typeof previous?.githubLogin === "string" &&
              previous.githubLogin.toLowerCase() ===
                String(t.githubLogin || "").toLowerCase());
          owner =
            sameAccount && typeof previous?.sub === "string"
              ? previous.sub
              : providerId;
        }
        const login = typeof t.githubLogin === "string" ? t.githubLogin : "";
        if (!owner || !providerId || !login)
          throw new Error("GitHub connection identity is missing.");
        const expiresAt =
          typeof account.expires_at === "number"
            ? account.expires_at * 1000
            : null;
        const refreshSeconds = account.refresh_token_expires_in;
        owner = await saveGithubCredentials(
          owner,
          login,
          {
            accessToken: account.access_token,
            refreshToken:
              typeof account.refresh_token === "string"
                ? account.refresh_token
                : null,
            expiresAt,
            refreshExpiresAt:
              typeof refreshSeconds === "number"
                ? Date.now() + refreshSeconds * 1000
                : null,
          },
          providerId,
        );
        token.sub = owner;
        t.githubProviderId = providerId;
        t.githubConnection = true;
        delete t.githubAccessToken;
        delete t.githubRefreshToken;
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
