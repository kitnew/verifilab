import Link from "next/link";
import { Activity } from "lucide-react";
import { auditDetail, auditLabel } from "@/lib/audit";

export type AuditTimelineEvent = {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
  project?: { id: string; name: string };
  task?: { id: string; title: string } | null;
};

export function AuditTimeline({ events, showProject = false, showTask = false }: { events: AuditTimelineEvent[]; showProject?: boolean; showTask?: boolean }) {
  if (events.length === 0) return <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No activity yet.</p>;

  return (
    <ol className="space-y-5 border-l border-slate-200 pl-6">
      {events.map((event) => {
        const detail = auditDetail(event.action, event.metadata);
        return <li className="relative" key={event.id}><span className="absolute -left-[31px] top-0.5 grid size-4 place-items-center rounded-full bg-indigo-100 ring-4 ring-white"><Activity className="size-2.5 text-indigo-700" /></span><div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm text-slate-900">{auditLabel(event.action)}</strong><time className="text-xs text-slate-400">{event.createdAt.toLocaleString()}</time></div>{detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}{((showTask && event.task && event.project) || (showProject && event.project)) && <p className="mt-1 text-xs text-slate-500">{showTask && event.task && event.project && <Link className="hover:text-indigo-600" href={`/dashboard/projects/${event.project.id}/tasks/${event.task.id}`}>{event.task.title}</Link>}{showTask && event.task && event.project && showProject && " · "}{showProject && event.project && <Link className="hover:text-indigo-600" href={`/dashboard/projects/${event.project.id}`}>{event.project.name}</Link>}</p>}</li>;
      })}
    </ol>
  );
}
