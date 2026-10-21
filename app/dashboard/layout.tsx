import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="min-h-svh bg-page">
      <DashboardHeader user={{ name: session.user.name, image: session.user.image }} />
      {children}
    </div>
  );
}

export const metadata: Metadata = { robots: { index: false, follow: false } };
