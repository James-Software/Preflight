import DeletePostButton from "@/components/DeletePostButton";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminLogin } from "@/lib/access";
import { getPostById, updatePost, deletePost } from "@/lib/blog";
import BlogEditor, { type BlogEditorAction } from "@/components/BlogEditor";

const save: BlogEditorAction = async (_prevState, formData) => {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin))
    return { error: "Not authorized." };
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing post id." };
  let notice = "saved";
  try {
    const previous = await getPostById(id);
    if (!previous) return { error: "This post is no longer available." };
    const published = formData.get("published") === "on";
    notice =
      previous.published === published
        ? "saved"
        : published
          ? "published"
          : "unpublished";
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
  revalidatePath("/dashboard/admin/blog");
  redirect(`/dashboard/admin/blog?notice=${notice}`);
};

async function remove(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) return;
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  await deletePost(id);
  revalidatePath("/blog");
  redirect("/dashboard/admin/blog?notice=deleted");
}

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/dashboard/admin/blog/${id}`)}`,
    );
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");

  const post = await getPostById(Number(id));
  if (!post) redirect("/dashboard/admin/blog");

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center justify-between">
          <a
            href="/dashboard/admin/blog"
            className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
          >
            &larr; All posts
          </a>
          <DeletePostButton
            action={remove}
            id={post.id}
            title={post.title}
            label="Delete post"
          />
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
          hiddenId={post.id}
        />
      </div>
    </main>
  );
}
