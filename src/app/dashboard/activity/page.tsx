import { Activity } from "lucide-react";
import { AuditTimeline } from "@/components/audit-timeline";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function ActivityPage() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
  });

  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Workspace</p><h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-950"><Activity className="size-7" />Activity</h1><p className="mt-2 text-slate-500">Latest audit activity across all projects.</p></div><Card><CardHeader><h2 className="font-semibold text-slate-950">Recent events</h2><p className="mt-1 text-sm text-slate-500">Showing the latest 100 events.</p></CardHeader><CardContent><AuditTimeline events={events} showProject showTask /></CardContent></Card></div>;
}
