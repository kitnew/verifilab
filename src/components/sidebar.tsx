"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Activity, ClipboardCheck, Database, FileSearch, FolderKanban, LayoutDashboard, Sparkles, TestTube2 } from "lucide-react";
import { setDemoRole } from "@/app/actions";
import type { Role } from "@/lib/review";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/tasks", label: "Tasks", icon: FileSearch },
  { href: "/dashboard/generation", label: "Generate", icon: Sparkles },
  { href: "/dashboard/review", label: "Review queue", icon: ClipboardCheck },
  { href: "/dashboard/datasets", label: "Datasets", icon: Database },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-18 items-center gap-3 border-b border-white/10 px-6">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-500"><TestTube2 className="size-5" /></span>
        <span><strong className="block text-base">VerifiLab</strong><span className="text-xs text-slate-400">RLVR workspace</span></span>
      </Link>
      <nav className="space-y-1 p-4" aria-label="Primary navigation">
        {links.map(({ href, label, icon: Icon }, index) => {
          const active = index === 0 ? pathname === "/dashboard" : href !== "/dashboard" && pathname.startsWith(href);
          return <Link key={label} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white", active && "bg-white/10 text-white")}><Icon className="size-4" />{label}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 p-4">
        <label htmlFor="demo-role" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Demo role</label>
        <select
          id="demo-role"
          value={role}
          disabled={pending}
          onChange={(event) => startTransition(async () => {
            setError("");
            const result = await setDemoRole(event.target.value as Role);
            if (result.error) return setError(result.error);
            router.refresh();
          })}
          className="h-9 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option className="text-slate-950" value="AUTHOR">Author</option>
          <option className="text-slate-950" value="REVIEWER">Reviewer</option>
          <option className="text-slate-950" value="ADMIN">Admin</option>
        </select>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <p className="mt-3 text-xs leading-5 text-slate-400">Demo only · No authentication</p>
      </div>
    </aside>
  );
}
