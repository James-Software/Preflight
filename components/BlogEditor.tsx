"use client";

import { useActionState, useEffect, useState } from "react";
import Markdown from "./Markdown";

export interface BlogEditorInitial {
  title: string;
  slug: string;
  description: string;
  markdown: string;
  published: boolean;
}
export type BlogEditorAction = (
  prevState: { error: string } | null,
  formData: FormData,
) => Promise<{ error: string } | null>;

const FIELD =
  "mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-primary";

export default function BlogEditor({
  initial,
  action,
  hiddenId,
}: {
  initial: BlogEditorInitial;
  action: BlogEditorAction;
  hiddenId?: number;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [values, setValues] = useState(initial);
  const dirty = Object.keys(initial).some(
    (key) =>
      values[key as keyof BlogEditorInitial] !==
      initial[key as keyof BlogEditorInitial],
  );
  const change = <K extends keyof BlogEditorInitial>(
    key: K,
    value: BlogEditorInitial[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  const label = values.published
    ? initial.published
      ? "Save changes"
      : "Publish post"
    : initial.published
      ? "Unpublish post"
      : "Save draft";
  const saving =
    values.published && !initial.published
      ? "Publishing…"
      : !values.published && initial.published
        ? "Unpublishing…"
        : "Saving…";
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      aria-busy={pending}
      className="mt-8 space-y-6"
    >
      <input type="hidden" name="markdown" value={values.markdown} />
      {typeof hiddenId === "number" && (
        <input type="hidden" name="id" value={hiddenId} />
      )}
      {state?.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-6 disabled:opacity-75"
      >
        <div>
          <label htmlFor="blog-title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="blog-title"
            name="title"
            required
            value={values.title}
            onChange={(e) => change("title", e.target.value)}
            placeholder="The build passed. The checkout didn’t."
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="blog-slug" className="text-sm font-medium">
            Slug
          </label>
          <input
            id="blog-slug"
            name="slug"
            value={values.slug}
            onChange={(e) => change("slug", e.target.value)}
            placeholder="Generated from the title if left blank"
            aria-describedby="blog-slug-help"
            className={FIELD}
          />
          <p id="blog-slug-help" className="mt-2 break-all text-sm text-muted">
            {values.slug
              ? `/blog/${values.slug}`
              : "Leave blank to generate the URL from the title."}
          </p>
        </div>
        <div>
          <label htmlFor="blog-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="blog-description"
            name="description"
            rows={2}
            value={values.description}
            onChange={(e) => change("description", e.target.value)}
            placeholder="One or two sentences for article previews."
            className={FIELD}
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span id="blog-content-label" className="text-sm font-medium">
              Content
            </span>
            <div
              className="flex gap-1 rounded-lg bg-panel p-1"
              role="group"
              aria-label="Editor view"
            >
              {(["write", "preview"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setTab(view)}
                  aria-pressed={tab === view}
                  className={`min-h-11 rounded-md px-4 text-sm font-medium capitalize ${tab === view ? "bg-ink text-white dark:bg-white dark:text-ink" : "text-muted"}`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>
          {tab === "write" ? (
            <textarea
              id="blog-markdown"
              aria-labelledby="blog-content-label"
              value={values.markdown}
              onChange={(e) => change("markdown", e.target.value)}
              placeholder="Write your post in Markdown. Paragraphs, lists, links, and fenced code blocks all work."
              className={`${FIELD} min-h-[50vh] font-mono text-sm leading-relaxed`}
            />
          ) : (
            <div
              aria-labelledby="blog-content-label"
              className="mt-3 min-h-[50vh] rounded-xl bg-surface p-5 md:p-8"
            >
              <h2 className="break-words text-3xl font-semibold tracking-tight">
                {values.title || "Untitled post"}
              </h2>
              {values.description && (
                <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed text-muted">
                  {values.description}
                </p>
              )}
              <div className="mt-8">
                {values.markdown.trim() ? (
                  <Markdown content={values.markdown} />
                ) : (
                  <p className="text-muted">Nothing to preview yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="published"
              checked={values.published}
              onChange={(e) => change("published", e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            Publish on the blog
          </label>
          <button
            type="submit"
            disabled={pending}
            className="pressable btn-primary min-h-11 rounded-full px-6 py-3 text-sm font-medium text-white disabled:cursor-wait"
          >
            {pending ? saving : label}
          </button>
        </div>
      </fieldset>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {pending
          ? saving
          : dirty
            ? "Unsaved changes"
            : values.published
              ? "Published · changes appear when you save."
              : "Draft · only visible to you."}
      </p>
    </form>
  );
}
