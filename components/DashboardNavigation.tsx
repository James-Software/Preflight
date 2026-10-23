"use client";

import { usePathname } from "next/navigation";

export default function DashboardNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    {
      href: "/dashboard",
      label: "Projects",
      active: !pathname.startsWith("/dashboard/admin"),
    },
    ...(isAdmin
      ? [
          {
            href: "/dashboard/admin",
            label: "Waitlist",
            active: pathname === "/dashboard/admin",
          },
          {
            href: "/dashboard/admin/blog",
            label: "Blog posts",
            active: pathname.startsWith("/dashboard/admin/blog"),
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Dashboard navigation"
      className="order-last flex w-full flex-wrap gap-x-5 sm:order-none sm:w-auto"
    >
      {links.map(({ href, label, active }) => (
        <a
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center text-sm font-medium ${active ? "text-ink dark:text-white" : "text-muted hover:text-ink dark:hover:text-white"}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
