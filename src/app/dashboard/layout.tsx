import Link from "next/link";
import { TestTube2 } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { getDemoRole } from "@/lib/demo-role";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getDemoRole();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} />
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center border-b border-slate-200 bg-white px-5 md:hidden"><Link href="/dashboard" className="flex items-center gap-2 font-bold"><TestTube2 className="size-5 text-indigo-600" />VerifiLab</Link></header>
        <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
