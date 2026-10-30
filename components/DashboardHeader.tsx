import DashboardNavigation from "./DashboardNavigation";
import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";
import type { ProfileUser } from "./Avatar";

export default function DashboardHeader({
  user,
  isAdmin = false,
  isGuest = false,
}: {
  user: ProfileUser;
  isAdmin?: boolean;
  isGuest?: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-page">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
        <Brand />
        <DashboardNavigation isAdmin={isAdmin} />
        <ProfileMenu user={user} isAdmin={isAdmin} isGuest={isGuest} />
      </div>
    </header>
  );
}
