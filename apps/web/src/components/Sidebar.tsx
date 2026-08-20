"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Projects" },
  { href: "/dashboard/onboard", label: "Onboard project" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col gap-8 border-b border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-6 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div>
        <p className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[color:var(--ink)]">
          UX Eval
        </p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Autonomous feedback
        </p>
      </div>

      <nav className="flex flex-row gap-2 md:flex-col" aria-label="Dashboard">
        {links.map((link) => {
          const active =
            link.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "rounded-md px-3 py-2 text-sm transition-colors duration-200",
                active
                  ? "bg-[color:var(--accent-soft)] text-[color:var(--ink)]"
                  : "text-[color:var(--muted)] hover:bg-[color:var(--accent-soft)]/60 hover:text-[color:var(--ink)]",
              ].join(" ")}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
