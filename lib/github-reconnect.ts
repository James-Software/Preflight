import { safeReturnTo } from "@/lib/return-to";

/** One automatic OAuth handoff; never send users around an authorization loop. */
export function reconnectGithub(returnTo: string, force = false): boolean {
  const destination = new URL(safeReturnTo(returnTo), window.location.origin);
  const key = `preflight:github-reconnect:${destination.pathname}`;
  if (!force) {
    let lastAttempt = 0;
    try {
      lastAttempt = Number(sessionStorage.getItem(key) || 0);
    } catch {
      /* The URL marker also protects browsers without storage. */
    }
    if (lastAttempt && Date.now() - lastAttempt < 60_000) return false;
    if (
      new URLSearchParams(window.location.search).get("githubReauth") === "1" &&
      !lastAttempt
    )
      return false;
  }
  try {
    sessionStorage.setItem(key, String(Date.now()));
  } catch {}
  destination.searchParams.set("githubReauth", "1");
  const callback = destination.pathname + destination.search + destination.hash;
  window.location.assign(
    `/login?reauth=github&callbackUrl=${encodeURIComponent(callback)}`,
  );
  return true;
}
export function githubReconnected() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("githubReauth")) {
    url.searchParams.delete("githubReauth");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
}
