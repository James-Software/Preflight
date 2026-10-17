import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isAdminLogin } from "@/lib/access";
import { createPost } from "@/lib/blog";
import DashboardHeader from "@/components/DashboardHeader";
import BlogEditor, {
  type BlogEditorAction,
} from "@/components/BlogEditor";

const create: BlogEditorAction = async (_prevState, formData) => {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin))
    return { error: "Not authorized." };
  try {
    await createPost({
      title: String(formData.get("title") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      description: String(formData.get("description") ?? ""),
      markdown: String(formData.get("markdown") ?? ""),
      published: formData.get("published") === "on",
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not create the post.",
    };
  }
  redirect("/dashboard/admin/blog");
};

export default async function NewBlogPostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-white dark:bg-[#05060a]">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-3xl px-6 py-14">
        <a
          href="/dashboard/admin/blog"
          className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink dark:text-white/50 dark:hover:text-white"
        >
          &larr; All posts
        </a>
        <h1 className="font-display mt-6 text-3xl font-bold tracking-tight text-ink dark:text-white">
          New post
        </h1>
        <BlogEditor
          initial={{
            title: "",
            slug: "",
            description: "",
            markdown: "",
            published: false,
          }}
          action={create}
          submitLabel="Create post"
        />
      </div>
    </main>
  );
}
