import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";
import type { ProfileUser } from "./Avatar";

export default function DashboardHeader({ user }: { user: ProfileUser }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-page/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <Brand />
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
