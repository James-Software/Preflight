import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listAuthProfiles } from "@/lib/auth-profiles";
import ProfilesManager from "@/components/ProfilesManager";

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; origin?: string }>;
}) {
  const owner = (await auth())?.user?.githubId;
  if (!owner) redirect("/login?callbackUrl=%2Fdashboard%2Fprofiles");
  const params = await searchParams;
  const returnTo =
    typeof params.returnTo === "string" &&
    /^\/dashboard\/projects\/\d+$/.test(params.returnTo)
      ? `${params.returnTo}?configureRun=1`
      : null;
  const profiles = await listAuthProfiles(owner);
  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Authentication profiles
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Save a test account’s session once, then choose it when you start a
          swarm. Profiles are scoped to one app origin.
        </p>
        <ProfilesManager
          initialProfiles={profiles}
          initialOrigin={typeof params.origin === "string" ? params.origin : ""}
          returnTo={returnTo}
        />
      </div>
    </main>
  );
}
