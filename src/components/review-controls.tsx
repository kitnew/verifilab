"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addReviewComment, changeTaskStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can, type ReviewAction, type Role, type TaskStatus } from "@/lib/review";

export function ReviewControls({ taskId, status, role }: { taskId: string; status: TaskStatus; role: Role }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const mayComment = can(role, "COMMENT");
  const actions = actionsFor(status, role);

  const changeStatus = (action: ReviewAction) => startTransition(async () => {
    setError("");
    const result = await changeTaskStatus(taskId, action, comment);
    if (result.error) return setError(result.error);
    setComment("");
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {mayComment && <div className="space-y-2"><Label htmlFor="review-comment">Review comment</Label><Textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} disabled={pending} maxLength={2_000} placeholder="Add context or explain a rejection…" /></div>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {actions.map(({ action, label, variant }) => <Button key={action} variant={variant} disabled={pending} onClick={() => changeStatus(action)}>{pending ? "Working…" : label}</Button>)}
        {mayComment && <Button variant="secondary" disabled={pending || !comment.trim()} onClick={() => startTransition(async () => {
          setError("");
          const result = await addReviewComment(taskId, comment);
          if (result.error) return setError(result.error);
          setComment("");
          router.refresh();
        })}>Add comment</Button>}
      </div>
      {!actions.length && !mayComment && <p className="text-sm text-slate-500">No review actions are available for the {role.toLowerCase()} role at this status.</p>}
    </div>
  );
}

function actionsFor(status: TaskStatus, role: Role): { action: ReviewAction; label: string; variant: "default" | "secondary" | "destructive" }[] {
  if (status === "DRAFT" && can(role, "SUBMIT_TASK")) return [{ action: "SUBMIT", label: "Submit for review", variant: "default" }];
  if (status === "IN_REVIEW") return [
    ...(can(role, "APPROVE_TASK") ? [{ action: "APPROVE" as const, label: "Approve", variant: "default" as const }] : []),
    ...(can(role, "REJECT_TASK") ? [{ action: "REJECT" as const, label: "Reject", variant: "destructive" as const }] : []),
  ];
  if (status === "REJECTED" && can(role, "REOPEN_REJECTED")) return [{ action: "REOPEN", label: "Reopen as draft", variant: "secondary" }];
  if (status === "APPROVED" && can(role, "REOPEN_APPROVED")) return [{ action: "REOPEN", label: "Reopen as draft", variant: "secondary" }];
  return [];
}
