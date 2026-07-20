"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelGenerationJob, retryGenerationJob } from "@/app/generation-actions";
import { Button } from "@/components/ui/button";

export function GenerationJobActions({ jobId, status, taskCount }: { jobId: string; status: string; taskCount: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const retryable = status === "FAILED" || status === "CANCELLED";
  const cancellable = !retryable && taskCount === 0;

  function run(action: "cancel" | "retry") {
    setError("");
    startTransition(async () => {
      const result = action === "cancel" ? await cancelGenerationJob(jobId) : await retryGenerationJob(jobId);
      if (result.error) return setError(result.error);
      if (result.jobId) router.push(`/dashboard/generation?job=${result.jobId}`); else router.refresh();
    });
  }

  return <div className="flex flex-col items-end gap-1">{retryable && <Button size="sm" disabled={pending} onClick={() => run("retry")}>{pending ? "Retrying…" : "Retry"}</Button>}{cancellable && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("cancel")}>{pending ? "Cancelling…" : "Cancel"}</Button>}{error && <span className="max-w-48 text-right text-xs text-red-600">{error}</span>}</div>;
}
