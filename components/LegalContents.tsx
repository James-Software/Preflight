export function legalSectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export default function LegalContents({ headings }: { headings: string[] }) {
  return (
    <nav
      aria-label="On this page"
      className="mt-8 rounded-xl bg-panel px-5 py-3"
    >
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          On this page
        </summary>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
          {headings.map((heading) => (
            <li key={heading}>
              <a
                href={`#${legalSectionId(heading)}`}
                className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
              >
                {heading}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
