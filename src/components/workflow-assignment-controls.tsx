"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTask } from "@/app/workflow-actions";
import { Button } from "@/components/ui/button";

type Member = { userId: string; name: string; role: string };

export function WorkflowAssignmentControls({ task, members }: {
  task: { id: string; assignedAuthorId: string | null; assignedReviewerId: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; dueDate: string };
  members: Member[];
}) {
  const router = useRouter();
  const [authorId, setAuthorId] = useState(task.assignedAuthorId ?? "");
  const [reviewerId, setReviewerId] = useState(task.assignedReviewerId ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const authors = members.filter((member) => ["AUTHOR", "ADMIN"].includes(member.role));
  const reviewers = members.filter((member) => ["REVIEWER", "ADMIN"].includes(member.role));
  const inputClass = "h-9 rounded-md border border-slate-200 bg-white px-2 text-xs";

  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    <select aria-label="Assigned author" className={inputClass} value={authorId} onChange={(event) => setAuthorId(event.target.value)}><option value="">Unassigned author</option>{authors.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select>
    <select aria-label="Assigned reviewer" className={inputClass} value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">No reviewer</option>{reviewers.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select>
    <select aria-label="Priority" className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => <option key={value}>{value}</option>)}</select>
    <input aria-label="Due date" className={inputClass} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
    <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
      setError("");
      const result = await assignTask(task.id, { authorId: authorId || null, reviewerId: reviewerId || null, priority, dueDate });
      if (result.error) return setError(result.error);
      router.refresh();
    })}>{pending ? "Saving…" : "Save"}</Button>
  </div>{error && <p className="text-xs text-red-600" role="alert">{error}</p>}</div>;
}
