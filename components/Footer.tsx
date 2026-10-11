export default function Footer() {
  return (
    <footer className="border-t border-mist bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
        <p className="font-display text-sm font-bold tracking-tight text-ink">
          Preflight
        </p>
        <p className="text-sm text-ink/45">
          An agent swarm that makes sure your app is ready for takeoff.
        </p>
        <p className="text-sm text-ink/45">&copy; 2026</p>
      </div>
    </footer>
  );
}
