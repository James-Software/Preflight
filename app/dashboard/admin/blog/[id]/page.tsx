import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminLogin } from "@/lib/access";
import { getPostById, updatePost, deletePost } from "@/lib/blog";
import BlogEditor, {
  type BlogEditorAction,
} from "@/components/BlogEditor";

const save: BlogEditorAction = async (_prevState, formData) => {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin))
    return { error: "Not authorized." };
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing post id." };
  try {
    await updatePost(id, {
      title: String(formData.get("title") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      description: String(formData.get("description") ?? ""),
      markdown: String(formData.get("markdown") ?? ""),
      published: formData.get("published") === "on",
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not save the post.",
    };
  }
  revalidatePath("/blog");
  redirect("/dashboard/admin/blog");
};

async function remove(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) return;
  const id = Number(formData.get("id"));
  if (id) await deletePost(id);
  revalidatePath("/blog");
  redirect("/dashboard/admin/blog");
}

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");

  const { id } = await params;
  const post = await getPostById(Number(id));
  if (!post) redirect("/dashboard/admin/blog");

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center justify-between">
          <a
            href="/dashboard/admin/blog"
            className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink dark:text-white/50 dark:hover:text-white"
          >
            &larr; All posts
          </a>
          <form action={remove}>
            <input type="hidden" name="id" value={post.id} />
            <button
              type="submit"
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10"
            >
              Delete post
            </button>
          </form>
        </div>
        <h1 className="font-sans mt-6 text-3xl font-semibold tracking-tight text-ink dark:text-white">
          Edit post
        </h1>
        <BlogEditor
          initial={{
            title: post.title,
            slug: post.slug,
            description: post.description ?? "",
            markdown: post.markdown,
            published: post.published,
          }}
          action={save}
          submitLabel="Save changes"
          hiddenId={post.id}
        />
      </div>
    </main>
  );
}
