"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTask } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteTaskButton({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-red-600" role="alert">{error}</span>}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this task? This cannot be undone.")) return;
          startTransition(async () => {
            const result = await deleteTask(taskId, projectId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Trash2 className="mr-2 size-4" />{pending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
