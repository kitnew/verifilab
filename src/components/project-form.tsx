"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { projectSchema, type ProjectInput } from "@/lib/validation";

export function ProjectForm() {
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", description: "" },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        setServerError("");
        const result = await createProject(values);
        if (result?.error) setServerError(result.error);
      })}
    >
      <Field label="Project name" error={errors.name?.message}>
        <Input {...register("name")} placeholder="e.g. Safety Evaluation Set" autoFocus />
      </Field>
      <Field label="Description" error={errors.description?.message}>
        <Textarea {...register("description")} placeholder="What will this project evaluate?" />
      </Field>
      {serverError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create project"}</Button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
