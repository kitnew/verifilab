import { redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) redirect("/dashboard");
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { username: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, isAdmin: true, isActive: true, memberships: { include: { project: { select: { name: true } } } } } }),
  ]);
  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Administration</p><h1 className="text-3xl font-bold">User accounts</h1><p className="mt-2 text-slate-500">Create login credentials and the account&apos;s first project role.</p></div>
    <Card><CardHeader><h2 className="font-semibold">New account</h2><p className="mt-1 text-sm text-slate-500">Passwords require 12 characters, a letter and a number.</p></CardHeader><CardContent><AccountForm projects={projects} /></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">Accounts ({users.length})</h2></CardHeader><CardContent className="divide-y divide-slate-100">{users.map((user) => <div className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0" key={user.id}><div className="mr-auto"><p className="font-semibold">{user.name}</p><p className="mt-1 text-xs text-slate-500">@{user.username}</p></div>{user.isAdmin && <Badge>ADMIN</Badge>}{user.memberships.map((membership) => <Badge key={membership.id}>{membership.project.name} · {membership.role}</Badge>)}<Badge>{user.isActive ? "ACTIVE" : "DISABLED"}</Badge></div>)}</CardContent></Card>
  </div>;
}
