import { auth } from "@/auth";
import { isAdminLogin } from "@/lib/access";
import { NextResponse } from "next/server";
export async function GET() {
  const session = await auth();
  return NextResponse.json({
    user: session?.user ? { name: session.user.name, image: session.user.image } : null,
    isAdmin: isAdminLogin(session?.user?.githubLogin), isGuest: session?.user?.isGuest === true,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" } });
}
