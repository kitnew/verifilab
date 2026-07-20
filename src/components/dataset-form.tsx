"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createDataset, updateDataset } from "@/app/dataset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { datasetSchema, type DatasetInput } from "@/lib/dataset";

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function DatasetForm({ projects, dataset }: { projects: { id: string; name: string }[]; dataset?: { id: string; projectId: string; name: string; description: string } }) {
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<DatasetInput>({
    resolver: zodResolver(datasetSchema),
    defaultValues: dataset ?? { projectId: projects[0]?.id ?? "", name: "", description: "" },
  });

  return <form className="space-y-5" onSubmit={handleSubmit(async (values) => {
    setError("");
    const result = dataset
      ? await updateDataset(dataset.id, { name: values.name, description: values.description })
      : await createDataset(values);
    if (result?.error) setError(result.error);
  })}>
    {!dataset && <Field label="Project" error={errors.projectId?.message}><select {...register("projectId")} className={selectClass}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>}
    <Field label="Dataset name" error={errors.name?.message}><Input {...register("name")} autoFocus /></Field>
    <Field label="Description" error={errors.description?.message}><Textarea {...register("description")} placeholder="What does this dataset measure?" /></Field>
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : dataset ? "Save changes" : "Create dataset"}</Button>
  </form>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
