import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminLogin } from "@/lib/access";
import { listAllPosts, deletePost } from "@/lib/blog";
import DashboardHeader from "@/components/DashboardHeader";

async function remove(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) return;
  const id = Number(formData.get("id"));
  if (id) await deletePost(id);
  revalidatePath("/dashboard/admin/blog");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AdminBlogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");

  const posts = await listAllPosts();

  return (
    <main className="min-h-screen bg-white">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
              Blog posts
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              Only you can publish here. Drafts stay hidden until you flip
              them to published.
            </p>
          </div>
          <a
            href="/dashboard/admin/blog/new"
            className="pressable btn-gradient rounded-full px-6 py-2.5 text-sm font-medium text-white"
          >
            New post
          </a>
        </div>

        {posts.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-mist p-8 text-center text-sm text-ink/50">
            No posts yet. Write the first one.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-mist rounded-2xl border border-mist">
            {posts.map((post) => (
              <li
                key={post.id}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {post.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-ink/50">
                    /blog/{post.slug} · {formatDate(post.created_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    post.published
                      ? "bg-emerald-500/10 text-emerald-700"
                      : "bg-ink/5 text-ink/50"
                  }`}
                >
                  {post.published ? "Published" : "Draft"}
                </span>
                <a
                  href={`/dashboard/admin/blog/${post.id}`}
                  className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-lavender"
                >
                  Edit
                </a>
                <form action={remove}>
                  <input type="hidden" name="id" value={post.id} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
