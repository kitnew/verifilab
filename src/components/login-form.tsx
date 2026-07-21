"use client";

import { useActionState } from "react";
import { login, type AuthState } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as AuthState);
  return <form action={action} className="space-y-5">
    <div className="space-y-2"><Label htmlFor="username">Username</Label><Input autoComplete="username" autoFocus id="username" name="username" required /></div>
    <div className="space-y-2"><Label htmlFor="password">Password</Label><Input autoComplete="current-password" id="password" name="password" required type="password" /></div>
    {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</p>}
    <Button className="w-full" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</Button>
  </form>;
}
