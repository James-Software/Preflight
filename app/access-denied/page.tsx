export default async function AccessDenied({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const waitlisted = (await searchParams).reason === "waitlist";
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-6 pb-16 pt-28">
      <div className="max-w-sm text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {waitlisted ? "You’re on the waitlist." : "We couldn’t sign you in."}
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          {waitlisted
            ? "Your access request was received. PreFlight is invite-only, and requests are reviewed by hand."
            : "Your sign-in didn’t complete. Please try again or use the GitHub account that has access."}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Expecting access? Email{" "}
          <a
            href="mailto:james@trypreflight.dev"
            className="font-medium text-primary underline underline-offset-4"
          >
            james@trypreflight.dev
          </a>
          .
        </p>
        <a
          href={waitlisted ? "/" : "/login"}
          className="pressable btn-primary mt-6 inline-flex min-h-11 items-center rounded-full px-6 py-3 text-sm font-medium text-white"
        >
          {waitlisted ? "Back to home" : "Try signing in again"}
        </a>
        {!waitlisted && (
          <a
            href="/"
            className="mt-3 flex min-h-11 items-center justify-center text-sm font-medium text-muted hover:text-primary"
          >
            Back to home
          </a>
        )}
      </div>
    </main>
  );
}
