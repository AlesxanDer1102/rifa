"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Registro" },
  { href: "/disponibilidad", label: "Disponibilidad" },
  { href: "/ganadores", label: "Ganadores" },
] as const;

/** Public site navigation. Admin routes have their own header buttons, so it is hidden there. */
export function SiteNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  const linkClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap ${
      active ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <nav aria-label="Navegación principal" className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-3 py-2 sm:px-6">
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/admin"
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Admin
        </Link>
      </div>
    </nav>
  );
}
