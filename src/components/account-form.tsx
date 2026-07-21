"use client";

import { useActionState } from "react";
import { createAccount, type AuthState } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createAccount, {} as AuthState);
  const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm";
  return <form action={action} className="grid gap-5 sm:grid-cols-2">
    <Field label="Full name"><Input name="name" required /></Field>
    <Field label="Username"><Input autoComplete="off" name="username" pattern="[a-z0-9._-]{3,32}" required /></Field>
    <Field label="Initial password"><Input autoComplete="new-password" minLength={12} name="password" required type="password" /></Field>
    <Field label="Project"><select className={selectClass} name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
    <Field label="Project role"><select className={selectClass} name="role"><option value="AUTHOR">Author</option><option value="REVIEWER">Reviewer</option><option value="CURATOR">Curator</option></select></Field>
    <div className="self-end"><Button disabled={pending || !projects.length} type="submit">{pending ? "Creating…" : "Create account"}</Button></div>
    {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2" role="alert">{state.error}</p>}
    {state.success && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 sm:col-span-2" role="status">{state.success}</p>}
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
