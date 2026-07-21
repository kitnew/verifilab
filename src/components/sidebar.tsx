"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardCheck, Database, FileSearch, FlaskConical, FolderKanban, LayoutDashboard, ListTodo, LogOut, Sparkles, TestTube2, Upload, Users } from "lucide-react";
import { logout } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/tasks", label: "Tasks", icon: FileSearch },
  { href: "/dashboard/my-work", label: "My Work", icon: ListTodo },
  { href: "/dashboard/imports", label: "Bulk import", icon: Upload },
  { href: "/dashboard/generation", label: "Generate", icon: Sparkles },
  { href: "/dashboard/evaluations", label: "Evaluations", icon: FlaskConical },
  { href: "/dashboard/review", label: "Review queue", icon: ClipboardCheck },
  { href: "/dashboard/datasets", label: "Datasets", icon: Database },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export function Sidebar({ user }: { user: { name: string; username: string | null; isAdmin: boolean } }) {
  const pathname = usePathname();
  const visibleLinks = user.isAdmin ? [...links, { href: "/dashboard/admin/users", label: "User accounts", icon: Users }] : links;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-18 items-center gap-3 border-b border-white/10 px-6">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-500"><TestTube2 className="size-5" /></span>
        <span><strong className="block text-base">VerifiLab</strong><span className="text-xs text-slate-400">RLVR workspace</span></span>
      </Link>
      <nav className="space-y-1 p-4" aria-label="Primary navigation">
        {visibleLinks.map(({ href, label, icon: Icon }, index) => {
          const active = index === 0 ? pathname === "/dashboard" : href !== "/dashboard" && pathname.startsWith(href);
          return <Link key={label} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white", active && "bg-white/10 text-white")}><Icon className="size-4" />{label}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 p-4">
        <p className="font-semibold">{user.name}</p><p className="mt-1 text-xs text-slate-400">@{user.username}</p>
        <form action={logout}><button className="mt-4 flex items-center gap-2 text-sm text-slate-300 hover:text-white" type="submit"><LogOut className="size-4" />Sign out</button></form>
      </div>
    </aside>
  );
}
