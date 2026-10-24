export default function DashboardNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Project or run not found.
      </h1>
      <p className="mt-5 text-muted">
        It may have been removed, or it belongs to another account.
      </p>
      <a
        href="/dashboard"
        className="pressable btn-primary mt-8 inline-flex min-h-11 items-center rounded-full px-6 py-3 text-sm font-medium text-white"
      >
        All projects
      </a>
    </main>
  );
}
