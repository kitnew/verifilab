"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createDatasetRelease } from "@/app/dataset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { datasetReleaseSchema, releaseSplitCounts, splitPercentagesSchema, type DatasetReleaseInput } from "@/lib/dataset-release";

export function DatasetReleaseForm({ datasetId, taskCount }: { datasetId: string; taskCount: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<DatasetReleaseInput>({
    resolver: zodResolver(datasetReleaseSchema),
    defaultValues: { version: "1.0.0", notes: "", seed: "42", trainPercentage: 80, validationPercentage: 10, testPercentage: 10 },
  });
  const [trainPercentage, validationPercentage, testPercentage] = useWatch({ control, name: ["trainPercentage", "validationPercentage", "testPercentage"] });
  const percentages = { trainPercentage, validationPercentage, testPercentage };
  const validPercentages = splitPercentagesSchema.safeParse(percentages);
  const preview = validPercentages.success ? releaseSplitCounts(taskCount, validPercentages.data) : null;

  return <form className="space-y-6" onSubmit={handleSubmit(async (values) => {
    setError("");
    const result = await createDatasetRelease(datasetId, values);
    if (result.error || !result.releaseId) return setError(result.error ?? "Could not create the release.");
    router.push(`/dashboard/datasets/${datasetId}/releases/${result.releaseId}`);
  })}>
    <div className="grid gap-5 md:grid-cols-2"><Field label="Semantic version" error={errors.version?.message}><Input {...register("version")} placeholder="1.0.0" /></Field><Field label="Seed" error={errors.seed?.message}><Input {...register("seed")} placeholder="42" /></Field><Field className="md:col-span-2" label="Release notes" error={errors.notes?.message}><Textarea {...register("notes")} maxLength={2_000} placeholder="What changed in this release?" /></Field></div>
    <div className="grid gap-5 sm:grid-cols-3"><Field label="Train %" error={errors.trainPercentage?.message}><Input {...register("trainPercentage", { valueAsNumber: true })} min="0" max="100" step="1" type="number" /></Field><Field label="Validation %" error={errors.validationPercentage?.message}><Input {...register("validationPercentage", { valueAsNumber: true })} min="0" max="100" step="1" type="number" /></Field><Field label="Test %" error={errors.testPercentage?.message}><Input {...register("testPercentage", { valueAsNumber: true })} min="0" max="100" step="1" type="number" /></Field></div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><h2 className="font-semibold">Split preview</h2>{preview ? <div className="mt-3 grid grid-cols-3 gap-3 text-center"><Preview label="Train" value={preview.train} /><Preview label="Validation" value={preview.validation} /><Preview label="Test" value={preview.test} /></div> : <p className="mt-2 text-sm text-red-700">Percentages must be non-negative integers totaling exactly 100%.</p>}<p className="mt-3 text-xs text-slate-500">{taskCount} current dataset task(s). Assignments are created only after server-side validation.</p></div>
    {taskCount === 0 && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">An empty dataset cannot produce a release.</p>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <Button disabled={isSubmitting || taskCount === 0 || !preview} type="submit">{isSubmitting ? "Creating…" : "Create immutable release"}</Button>
  </form>;
}

function Field({ label, error, children, className = "" }: { label: string; error?: string; children: React.ReactNode; className?: string }) { return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}{error && <p className="text-sm text-red-600">{error}</p>}</div>; }
function Preview({ label, value }: { label: string; value: number }) { return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
