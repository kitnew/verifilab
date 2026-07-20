"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, FolderKanban, LayoutDashboard, TestTube2 } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Projects", icon: FolderKanban },
  { href: "/dashboard", label: "Datasets", icon: Database, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-18 items-center gap-3 border-b border-white/10 px-6">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-500"><TestTube2 className="size-5" /></span>
        <span><strong className="block text-base">VerifiLab</strong><span className="text-xs text-slate-400">RLVR workspace</span></span>
      </Link>
      <nav className="space-y-1 p-4" aria-label="Primary navigation">
        {links.map(({ href, label, icon: Icon, disabled }, index) => (
          <Link key={label} href={disabled ? "#" : href} aria-disabled={disabled} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white", index === 0 && pathname === "/dashboard" && "bg-white/10 text-white", disabled && "pointer-events-none opacity-40")}>
            <Icon className="size-4" />{label}{disabled && <span className="ml-auto text-[10px] uppercase">Soon</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 p-4 text-xs leading-5 text-slate-400">Local prototype<br />No authentication</div>
    </aside>
  );
}
