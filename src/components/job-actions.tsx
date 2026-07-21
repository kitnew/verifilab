"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelAsyncJob, retryJob } from "@/app/job-actions";
import { Button } from "@/components/ui/button";

export function JobActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (status !== "QUEUED" && status !== "RUNNING") return;
    const timer = window.setInterval(() => router.refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [router, status]);
  return <div className="space-y-2"><div className="flex gap-2">
    {(status === "QUEUED" || status === "RUNNING") && <Button disabled={pending} variant="secondary" onClick={() => startTransition(async () => { setError(""); const result = await cancelAsyncJob(jobId); if (result.error) setError(result.error); else router.refresh(); })}>Cancel</Button>}
    {(status === "FAILED" || status === "CANCELLED") && <Button disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await retryJob(jobId); if (result.error) setError(result.error); else if (result.jobId) router.push(`/dashboard/jobs/${result.jobId}`); })}>Retry</Button>}
  </div>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}</div>;
}
