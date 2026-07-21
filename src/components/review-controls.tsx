"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addReviewComment, changeTaskStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can, canEditAssignedTask, canReviewAssignedTask, type ReviewAction, type Role, type TaskStatus } from "@/lib/review";

export function ReviewControls({ taskId, status, role, userId, assignedAuthorId, assignedReviewerId }: { taskId: string; status: TaskStatus; role: Role; userId: string; assignedAuthorId: string | null; assignedReviewerId: string | null }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const mayReview = canReviewAssignedTask(role, userId, assignedAuthorId, assignedReviewerId);
  const mayComment = can(role, "COMMENT") && mayReview;
  const actions = actionsFor(status, role, canEditAssignedTask(role, userId, assignedAuthorId), mayReview);

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

function actionsFor(status: TaskStatus, role: Role, mayEdit: boolean, mayReview: boolean): { action: ReviewAction; label: string; variant: "default" | "secondary" | "destructive" }[] {
  if (status === "DRAFT" && mayEdit) return [{ action: "START", label: "Start work", variant: "default" }];
  if (status === "CHANGES_REQUESTED" && mayEdit) return [{ action: "START", label: "Resume work", variant: "default" }];
  if (status === "IN_PROGRESS" && mayEdit && can(role, "SUBMIT_TASK")) return [{ action: "SUBMIT", label: "Submit for review", variant: "default" }];
  if (status === "IN_REVIEW" && mayReview) return [
    { action: "APPROVE", label: "Approve", variant: "default" },
    { action: "REQUEST_CHANGES", label: "Request changes", variant: "secondary" },
    { action: "REJECT", label: "Reject", variant: "destructive" },
  ];
  return [];
}
