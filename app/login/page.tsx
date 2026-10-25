import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import LoginHandoff from "@/components/LoginHandoff";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reauth?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.callbackUrl);
  const session = await auth();
  if (session?.user && params.reauth !== "github") redirect(returnTo);
  return (
    <LoginHandoff returnTo={returnTo} reconnect={params.reauth === "github"} />
  );
}
