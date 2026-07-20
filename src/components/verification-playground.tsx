"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import { runVerification } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VerificationResult } from "@/lib/verifier";

export function VerificationPlayground({ taskId, disabled }: { taskId: string; disabled: boolean }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState("");
  const [result, setResult] = useState<VerificationResult>();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="candidate">Candidate response</Label>
        <Textarea
          id="candidate"
          value={candidate}
          onChange={(event) => setCandidate(event.target.value)}
          disabled={disabled || pending}
          maxLength={10_000}
          placeholder="Enter the answer to verify…"
          className="min-h-32 font-mono"
        />
      </div>

      {disabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="alert">This task has an invalid verifier configuration. Edit the task before running verification.</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      <Button
        disabled={disabled || pending}
        onClick={() => startTransition(async () => {
          setError("");
          setResult(undefined);
          const response = await runVerification(taskId, candidate);
          if (response.error) return setError(response.error);
          setResult(response.result);
          router.refresh();
        })}
      >
        <Play className="mr-2 size-4" />{pending ? "Running…" : "Run verification"}
      </Button>

      {result && (
        <div className={result.passed ? "rounded-xl border border-emerald-200 bg-emerald-50 p-5" : "rounded-xl border border-red-200 bg-red-50 p-5"} aria-live="polite">
          <div className="flex items-center gap-2">
            {result.passed ? <CheckCircle2 className="size-5 text-emerald-600" /> : <XCircle className="size-5 text-red-600" />}
            <strong className={result.passed ? "text-emerald-800" : "text-red-800"}>{result.passed ? "PASS" : "FAIL"}</strong>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Reward</dt><dd className="mt-1 font-semibold text-slate-900">{result.reward}</dd></div>
            <div><dt className="text-slate-500">Execution time</dt><dd className="mt-1 font-semibold text-slate-900">{result.executionTimeMs.toFixed(3)} ms</dd></div>
            <div className="sm:col-span-3"><dt className="text-slate-500">Details</dt><dd className="mt-1 text-slate-800">{result.details}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
