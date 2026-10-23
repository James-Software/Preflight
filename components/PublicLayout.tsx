import { auth } from "@/auth";
import { isAdminLogin } from "@/lib/access";
import Nav from "./Nav";
import Footer from "./Footer";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;
  return (
    <div className="min-h-svh bg-page">
      <Nav
        user={user ? { name: user.name, image: user.image } : null}
        isAdmin={isAdminLogin(user?.githubLogin)}
      />
      {children}
      <Footer />
    </div>
  );
}
