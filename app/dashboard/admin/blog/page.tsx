import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminLogin } from "@/lib/access";
import { listAllPosts, deletePost } from "@/lib/blog";
import DeletePostButton from "@/components/DeletePostButton";

async function remove(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) redirect("/dashboard");
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  await deletePost(id);
  revalidatePath("/blog");
  revalidatePath("/dashboard/admin/blog");
  redirect("/dashboard/admin/blog?notice=deleted");
}
const NOTICES: Record<string, string> = {
  draft: "Draft saved. It’s only visible to you.",
  published: "Post published. It’s now available on the blog.",
  saved: "Changes saved.",
  unpublished: "Post unpublished. It’s now a private draft.",
  deleted: "Post deleted.",
};
export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user)
    redirect("/login?callbackUrl=%2Fdashboard%2Fadmin%2Fblog");
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");
  const posts = await listAllPosts();
  const { notice } = await searchParams;
  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Blog posts
            </h1>
            <p className="mt-2 text-sm text-muted">
              Manage drafts and published articles.
            </p>
          </div>
          <a
            href="/dashboard/admin/blog/new"
            className="pressable btn-gradient inline-flex min-h-11 items-center rounded-full px-6 py-2.5 text-sm font-medium text-white"
          >
            New post
          </a>
        </div>
        {notice && NOTICES[notice] && (
          <p role="status" className="mt-6 rounded-xl bg-panel p-4 text-sm">
            {NOTICES[notice]}
            {notice === "published" && (
              <>
                {" "}
                <a
                  href="/blog"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  View blog
                </a>
              </>
            )}
          </p>
        )}
        {!posts.length ? (
          <p className="mt-8 rounded-2xl bg-panel p-8 text-center text-muted">
            No posts yet. Write the first one.
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {posts.map((post) => (
              <li
                key={post.id}
                className="flex min-w-0 flex-col gap-5 rounded-2xl bg-surface p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={`/dashboard/admin/blog/${post.id}`}
                    className="break-words text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {post.title}
                  </a>
                  <p className="mt-2 break-all text-sm text-muted">
                    /blog/{post.slug}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {new Date(post.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <span
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${post.published ? "bg-emerald-500/10 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-panel text-muted"}`}
                  >
                    {post.published ? "Published" : "Draft"}
                  </span>
                  <a
                    href={`/dashboard/admin/blog/${post.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-panel"
                  >
                    Edit<span className="sr-only"> {post.title}</span>
                  </a>
                  <DeletePostButton
                    action={remove}
                    id={post.id}
                    title={post.title}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
