"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { duplicateTask } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DuplicateTaskButton({ taskId }: { taskId: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
        setError("");
        const result = await duplicateTask(taskId);
        if (result?.error) setError(result.error);
      })}>
        <Copy className="mr-2 size-4" />{pending ? "Duplicating…" : "Duplicate"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
