"use client";

import { useState, useTransition } from "react";
import { restoreVerifierVersion } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RestoreVerifierButton({ taskId, projectId, verifierVersionId }: { taskId: string; projectId: string; verifierVersionId: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="text-right"><Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
    const result = await restoreVerifierVersion(taskId, projectId, verifierVersionId);
    setError(result.error ?? "");
  })}>{pending ? "Restoring…" : "Restore as new version"}</Button>{error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}</div>;
}
