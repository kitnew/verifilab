"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runDatasetQualityScan } from "@/app/dataset-actions";
import { Button } from "@/components/ui/button";

export function DatasetQualityScanButton({ datasetId, hasReport }: { datasetId: string; hasReport: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="text-right"><Button disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await runDatasetQualityScan(datasetId); if (result.error) setError(result.error); else router.refresh(); })}>{pending ? "Scanning…" : hasReport ? "Rerun scan" : "Run scan"}</Button>{error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}</div>;
}
