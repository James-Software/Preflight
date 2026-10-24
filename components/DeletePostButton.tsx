"use client";

import SubmitButton from "./SubmitButton";

export default function DeletePostButton({
  action,
  id,
  title,
  label = "Delete",
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: number;
  title: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${title}”? This cannot be undone.`))
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        ariaLabel={`Delete ${title}`}
        pendingLabel="Deleting…"
        className="rounded-full px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
