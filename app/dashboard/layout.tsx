import type { Metadata } from "next";
import { auth } from "@/auth";
import { isAdminLogin } from "@/lib/access";
import DashboardHeader from "@/components/DashboardHeader";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Pages enforce auth before data reads and preserve their own return URL.
  if (!session?.user) return children;
  return (
    <div className="min-h-svh bg-page">
      <DashboardHeader
        user={{ name: session.user.name, image: session.user.image }}
        isAdmin={isAdminLogin(session.user.githubLogin)}
        isGuest={session.user.isGuest}
      />
      {session.user.isGuest && <div className="border-b border-line bg-panel px-6 py-3 text-sm text-ink dark:text-white" role="status">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>Guest demo · Preflight-Example is ready. Your runs are saved in this browser for up to 30 days.</p>
          <form action="/demo/exit?next=login" method="post"><button className="min-h-11 font-medium text-primary underline underline-offset-4">Sign in with GitHub for your own projects</button></form>
        </div>
      </div>}
      {children}
    </div>
  );
}

export const metadata: Metadata = { robots: { index: false, follow: false } };
