"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProjectMembership } from "@/app/workflow-actions";
import { Button } from "@/components/ui/button";

export function ProjectMemberships({ projectId, users, memberships }: {
  projectId: string;
  users: { id: string; name: string }[];
  memberships: { userId: string; name: string; role: string }[];
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [role, setRole] = useState("AUTHOR");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectClass = "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm";
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><select aria-label="Project user" className={selectClass} value={userId} onChange={(event) => setUserId(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><select aria-label="Project role" className={selectClass} value={role} onChange={(event) => setRole(event.target.value)}>{["AUTHOR", "REVIEWER", "CURATOR", "OPERATOR", "ADMIN"].map((value) => <option key={value}>{value}</option>)}</select><Button size="sm" disabled={pending || !userId} onClick={() => startTransition(async () => { setError(""); const result = await setProjectMembership(projectId, userId, role); if (result.error) return setError(result.error); router.refresh(); })}>{pending ? "Saving…" : "Add or update"}</Button></div>{error && <p className="text-sm text-red-600" role="alert">{error}</p>}<div className="flex flex-wrap gap-2">{memberships.map((membership) => <span className="rounded-full bg-slate-100 px-3 py-1 text-xs" key={membership.userId}>{membership.name} · {membership.role.toLowerCase()}</span>)}</div></div>;
}
