"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createTask, updateTask } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { taskSchema, type TaskInput } from "@/lib/validation";

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function TaskForm({ projectId, taskId, initialValues }: { projectId: string; taskId?: string; initialValues?: TaskInput }) {
  const [serverError, setServerError] = useState("");
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: initialValues ?? {
      title: "", prompt: "", verifierType: "EXACT_MATCH", difficulty: "MEDIUM", status: "DRAFT",
      tags: "", expectedText: "", expectedNumber: "", tolerance: "0", pattern: "", flags: "", jsonSchema: "", changeSummary: "",
    },
  });
  const verifierType = useWatch({ control, name: "verifierType" });

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        setServerError("");
        const result = taskId ? await updateTask(taskId, projectId, values) : await createTask(projectId, values);
        if (result?.error) setServerError(result.error);
      })}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Title" error={errors.title?.message} wide><Input {...register("title")} autoFocus /></Field>
        <Field label="Prompt" error={errors.prompt?.message} wide><Textarea {...register("prompt")} className="min-h-40" /></Field>
        <Field label="Verifier type" error={errors.verifierType?.message}>
          <select {...register("verifierType")} className={selectClass}><option value="EXACT_MATCH">Exact match</option><option value="NUMERIC">Numeric</option><option value="REGEX">Regular expression</option><option value="JSON_SCHEMA">JSON Schema</option></select>
        </Field>
        <Field label="Difficulty" error={errors.difficulty?.message}>
          <select {...register("difficulty")} className={selectClass}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select>
        </Field>
        <Field label="Tags" error={errors.tags?.message}><Input {...register("tags")} placeholder="math, reasoning" /></Field>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Verifier configuration</h2>
        {verifierType === "EXACT_MATCH" && <Field label="Expected answer" error={errors.expectedText?.message}><Input {...register("expectedText")} /></Field>}
        {verifierType === "NUMERIC" && <div className="grid gap-5 sm:grid-cols-2"><Field label="Expected number" error={errors.expectedNumber?.message}><Input {...register("expectedNumber")} inputMode="decimal" /></Field><Field label="Tolerance" error={errors.tolerance?.message}><Input {...register("tolerance")} inputMode="decimal" /></Field></div>}
        {verifierType === "REGEX" && <div className="grid gap-5 sm:grid-cols-[1fr_140px]"><Field label="Pattern" error={errors.pattern?.message}><Input {...register("pattern")} className="font-mono" /></Field><Field label="Flags" error={errors.flags?.message}><Input {...register("flags")} placeholder="i" className="font-mono" /></Field></div>}
        {verifierType === "JSON_SCHEMA" && <Field label="JSON Schema" error={errors.jsonSchema?.message}><Textarea {...register("jsonSchema")} className="min-h-64 font-mono" placeholder={'{"type":"object","required":["answer"]}'} /></Field>}
      </div>

      {taskId && <Field label="Verifier change summary (optional)" error={errors.changeSummary?.message}><Input {...register("changeSummary")} placeholder="Why did the verifier change?" /></Field>}

      {serverError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : taskId ? "Save changes" : "Create task"}</Button>
    </form>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label>{label}</Label>{children}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
