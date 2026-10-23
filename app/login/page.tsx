import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import LoginHandoff from "@/components/LoginHandoff";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const returnTo = safeReturnTo((await searchParams).callbackUrl);
  const session = await auth();
  if (session?.user) redirect(returnTo);
  return <LoginHandoff returnTo={returnTo} />;
}
