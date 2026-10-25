"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RepoPicker from "@/components/RepoPicker";
import ProjectLogo from "@/components/ProjectLogo";
import { reconnectGithub } from "@/lib/github-reconnect";
type Settings = {
  id: number;
  displayName: string;
  appUrl: string;
  repo: string;
  imageUrl: string | null;
};
export default function ProjectGeneralSettings({
  project,
}: {
  project: Settings;
}) {
  const router = useRouter();
  const [savedImage, setSavedImage] = useState(project.imageUrl);
  useEffect(() => setSavedImage(project.imageUrl), [project.imageUrl]);
  const [displayName, setDisplayName] = useState(project.displayName),
    [appUrl, setAppUrl] = useState(project.appUrl),
    [repo, setRepo] = useState(project.repo);
  const [changingRepo, setChangingRepo] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [imageMode, setImageMode] = useState<"keep" | "auto" | "upload">(
      "keep",
    ),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Refresh the persisted baseline without discarding a user's in-flight form.
  useEffect(() => {
    setRepo(project.repo);
    setChangingRepo(false);
  }, [project.repo]);
  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-line bg-page px-3 py-2.5 text-sm";
  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(picked.type) ||
      picked.size > 2 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPG or WebP image up to 2 MB.");
      event.target.value = "";
      return;
    }
    setError("");
    setSaved(false);
    setFile(picked);
    setImageMode("upload");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const form = new FormData();
    form.set("displayName", displayName);
    form.set("appUrl", appUrl);
    form.set("repo", repo);
    form.set("imageMode", imageMode);
    if (file && imageMode === "upload") form.set("image", file);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: form,
      });
      const data = await response.json();
      if (
        data.code === "GITHUB_REAUTH_REQUIRED" &&
        reconnectGithub(`/dashboard/projects/${project.id}/general`)
      )
        return;
      if (!response.ok)
        throw new Error(data.error || "Could not save project settings.");
      setSavedImage(data.imageUrl ?? null);
      setSaved(true);
      setImageMode("keep");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setChangingRepo(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      method="post"
      action={`/api/projects/${project.id}`}
      onSubmit={save}
      className="mt-8 max-w-3xl space-y-7"
    >
      <fieldset
        disabled={!ready || busy}
        className="min-w-0 space-y-7 disabled:opacity-60"
      >
        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="project-identity"
        >
          <h2 id="project-identity" className="text-base font-semibold">
            Project identity
          </h2>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <ProjectLogo
              projectId={project.id}
              name={displayName || repo}
              appUrl={project.appUrl || null}
              imageUrl={preview || (imageMode === "auto" ? null : savedImage)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="pressable inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-panel focus-within:outline-2 focus-within:outline-primary">
                Change image
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={chooseImage}
                  className="sr-only"
                  aria-label="Upload project image"
                />
              </label>
              {(savedImage || file) && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setImageMode("auto");
                    setSaved(false);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="pressable min-h-11 cursor-pointer rounded-lg px-3 text-sm text-muted hover:bg-panel hover:text-primary"
                >
                  Use site favicon
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            PNG, JPG or WebP, up to 2 MB. Defaults to your site’s favicon.
          </p>
          <label className="mt-6 block text-sm font-medium">
            Display name
            <input
              name="displayName"
              maxLength={80}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
              placeholder={project.repo.split("/").pop()}
              className={field}
            />
          </label>
        </section>
        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="project-app"
        >
          <h2 id="project-app" className="text-base font-semibold">
            App URL
          </h2>
          <label className="mt-4 block text-sm">
            Deployed app URL
            <input
              name="appUrl"
              type="url"
              value={appUrl}
              onChange={(e) => {
                setAppUrl(e.target.value);
                setSaved(false);
              }}
              placeholder="https://myapp.com"
              className={field}
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Leave blank to use the default branch’s latest preview deployment.
            Database connections and authentication profiles stay scoped to
            their original app origins.
          </p>
        </section>
        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="project-github"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="project-github"
              className="inline-flex items-center gap-2 text-base font-semibold"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 .7a11.3 11.3 0 0 0-3.57 22c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.52-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.72 2.65 1.22 3.3.94.1-.73.4-1.22.72-1.5-2.5-.28-5.13-1.25-5.13-5.58 0-1.24.44-2.25 1.17-3.04-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.55.23 2.7.11 2.98.73.79 1.17 1.8 1.17 3.04 0 4.34-2.64 5.3-5.15 5.58.41.35.77 1.03.77 2.08v3.08c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .7Z" />
              </svg>
              GitHub repository
            </h2>
            <button
              type="button"
              onClick={() => {
                setChangingRepo((value) => !value);
                setRepo(project.repo);
                setSaved(false);
              }}
              className="pressable min-h-11 cursor-pointer rounded-lg border border-line px-3 text-sm hover:bg-panel"
            >
              {changingRepo ? "Cancel repository change" : "Change repository"}
            </button>
          </div>
          <p className="mt-3 break-all text-sm text-muted">{repo}</p>
          {changingRepo && (
            <div className="mt-5">
              <RepoPicker
                name="repositoryChoice"
                onSelection={setRepo}
                returnTo={`/dashboard/projects/${project.id}/general`}
              />
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            New runs use the selected repository. Existing runs and their fix
            PRs keep their original repository.
          </p>
        </section>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted">
            Project settings saved.
          </p>
        )}
        <button
          type="submit"
          disabled={busy || (changingRepo && repo === project.repo)}
          className="pressable btn-primary min-h-11 cursor-pointer px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </fieldset>
    </form>
  );
}
