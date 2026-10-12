export default function AccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          You&apos;re not on the list
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/60">
          PreFlight is invite-only right now. If you were expecting access,
          ask the person who invited you to add your GitHub email.
        </p>
        <a
          href="/"
          className="pressable btn-gradient mt-8 inline-block rounded-full px-6 py-3 text-sm font-medium text-white"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
