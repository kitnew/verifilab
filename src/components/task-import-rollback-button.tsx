"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TaskImportRollbackButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function rollback() {
    if (!window.confirm("Roll back this import? Newly imported tasks will be deleted and replaced tasks restored.")) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/task-imports/" + importId + "/rollback", { method: "POST" });
      const data: unknown = await response.json();
      if (!response.ok) setError(message(data));
      else router.refresh();
    } catch { setError("Could not roll back the import."); }
    finally { setPending(false); }
  }
  return <div className="text-right"><Button variant="destructive" disabled={pending} onClick={rollback}>{pending ? "Rolling back…" : "Rollback import"}</Button>{error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-700">{error}</p>}</div>;
}

function message(value: unknown) { return value !== null && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "Could not roll back the import."; }
