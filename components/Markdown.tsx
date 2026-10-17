"use client";

import ReactMarkdown from "react-markdown";

/* ------------------------------------------------------------------ */
/* Markdown renderer for blog posts. Themed typography, no plugin      */
/* deps — plain react-markdown with styled elements.                   */
/* ------------------------------------------------------------------ */

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mt-10 text-3xl font-semibold tracking-tight text-ink first:mt-0 md:text-4xl dark:text-white">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-10 text-2xl font-semibold tracking-tight text-ink dark:text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-8 text-xl font-semibold tracking-tight text-ink dark:text-white">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mt-5 text-base leading-relaxed text-ink/70 md:text-lg md:leading-relaxed dark:text-neutral-300">
            {children}
          </p>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-primary underline underline-offset-4 decoration-primary/40 transition-colors duration-150 hover:text-ink hover:decoration-ink dark:hover:text-white dark:hover:decoration-white"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="mt-5 list-disc space-y-2 pl-6 text-ink/70 dark:text-neutral-300">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-5 list-decimal space-y-2 pl-6 text-ink/70 dark:text-neutral-300">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="mt-6 border-l-2 border-primary/60 pl-5 text-ink/70 italic dark:text-neutral-300">
            {children}
          </blockquote>
        ),
        pre: ({ children }) => (
          <pre className="mt-6 overflow-x-auto rounded-xl border border-ink/10 bg-ink/5 p-5 font-mono text-sm leading-relaxed text-ink/80 dark:border-white/10 dark:bg-black/40 dark:text-neutral-200 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-[0.9em] text-ink dark:bg-white/10 dark:text-white">
            {children}
          </code>
        ),
        hr: () => <hr className="my-10 border-ink/10 dark:border-white/10" />,
        img: ({ src, alt }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt ?? ""}
            className="mt-6 rounded-xl border border-ink/10 dark:border-white/10"
          />
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-ink dark:text-white">{children}</strong>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
