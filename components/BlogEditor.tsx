"use client";

import { useActionState, useState } from "react";
import Markdown from "./Markdown";

/* ------------------------------------------------------------------ */
/* Blog post editor: write markdown with a live preview tab. Used by   */
/* both the new-post and edit-post admin pages.                        */
/* ------------------------------------------------------------------ */

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

export default function BlogEditor({
  initial,
  action,
  submitLabel,
  hiddenId,
}: {
  initial: BlogEditorInitial;
  action: BlogEditorAction;
  submitLabel: string;
  hiddenId?: number;
}) {
  const [state, formAction] = useActionState(action, null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [markdown, setMarkdown] = useState(initial.markdown);

  return (
    <form action={formAction} className="mt-8 space-y-6">
      {typeof hiddenId === "number" ? (
        <input type="hidden" name="id" value={hiddenId} />
      ) : null}
      {state?.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="blog-title"
          className="text-sm font-medium text-ink"
        >
          Title
        </label>
        <input
          id="blog-title"
          name="title"
          type="text"
          required
          defaultValue={initial.title}
          placeholder="Why your staging environment lies to you"
          className="mt-2 w-full rounded-xl border border-mist bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors duration-150 placeholder:text-ink/30 focus:border-primary"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="blog-slug" className="text-sm font-medium text-ink">
            Slug
          </label>
          <input
            id="blog-slug"
            name="slug"
            type="text"
            defaultValue={initial.slug}
            placeholder="auto-generated from the title"
            className="mt-2 w-full rounded-xl border border-mist bg-white px-4 py-3 font-mono text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink/30 focus:border-primary"
          />
          <p className="mt-1.5 text-xs text-ink/50">
            Leave blank to generate from the title. Lives at
            /blog/your-slug.
          </p>
        </div>
        <div>
          <label
            htmlFor="blog-description"
            className="text-sm font-medium text-ink"
          >
            Description
          </label>
          <input
            id="blog-description"
            name="description"
            type="text"
            defaultValue={initial.description}
            placeholder="One or two sentences for previews and SEO."
            className="mt-2 w-full rounded-xl border border-mist bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors duration-150 placeholder:text-ink/30 focus:border-primary"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="blog-markdown"
            className="text-sm font-medium text-ink"
          >
            Content
          </label>
          <div className="flex rounded-full border border-mist p-0.5">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors duration-150 ${
                  tab === t
                    ? "bg-ink text-white"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {tab === "write" ? (
          <textarea
            id="blog-markdown"
            name="markdown"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={"# Your headline\n\nWrite in Markdown. **Bold**, `code`, lists, and fenced code blocks all work."}
            className="mt-2 min-h-[50vh] w-full rounded-xl border border-mist bg-white px-4 py-3 font-mono text-sm leading-relaxed text-ink outline-none transition-colors duration-150 placeholder:text-ink/30 focus:border-primary"
          />
        ) : (
          <div className="mt-2 min-h-[50vh] rounded-xl bg-[#05060a] p-6 md:p-8">
            {markdown.trim() ? (
              <Markdown content={markdown} />
            ) : (
              <p className="text-sm text-white/40">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="published"
            defaultChecked={initial.published}
            className="h-4 w-4 accent-[#6366f1]"
          />
          Published
        </label>
        <button
          type="submit"
          className="pressable btn-gradient cursor-pointer rounded-full px-7 py-3 text-sm font-medium text-white"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
