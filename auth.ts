import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// GitHub-only login for now. JWT sessions mean no database tables are
// needed for auth itself — the session lives in an encrypted cookie.
// Required env: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_SECRET, AUTH_URL.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: {
    // Skip Auth.js's default sign-in page; /login goes straight to GitHub.
    signIn: "/login",
  },
});
