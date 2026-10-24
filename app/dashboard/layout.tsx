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
      />
      {children}
    </div>
  );
}

export const metadata: Metadata = { robots: { index: false, follow: false } };
