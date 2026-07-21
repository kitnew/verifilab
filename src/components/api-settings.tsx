"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createProjectApiToken, renameProjectApiToken, revokeProjectApiToken } from "@/app/api-token-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiTokenScopes } from "@/lib/api-token-scopes";

type Token = { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdBy: { name: string } | null };
type Endpoint = "tasks-list" | "tasks-create" | "verification" | "dataset" | "job";
const endpoints: Record<Endpoint, { method: "GET" | "POST"; label: string; path: (id: string) => string }> = {
  "tasks-list": { method: "GET", label: "List tasks", path: () => "/api/v1/tasks" },
  "tasks-create": { method: "POST", label: "Create task", path: () => "/api/v1/tasks" },
  verification: { method: "POST", label: "Run verification", path: () => "/api/v1/verifications" },
  dataset: { method: "GET", label: "Get dataset", path: (id) => `/api/v1/datasets/${encodeURIComponent(id)}` },
  job: { method: "GET", label: "Get job", path: (id) => `/api/v1/jobs/${encodeURIComponent(id)}` },
};
const taskExample = JSON.stringify({ title: "API example", prompt: "Return exactly hello.", verifierType: "EXACT_MATCH", difficulty: "EASY", status: "DRAFT", tags: "api", expectedText: "hello" }, null, 2);

export function ApiSettings({ projectId, tokens }: { projectId: string; tokens: Token[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["tasks:read"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [raw, setRaw] = useState<{ tokenId: string; value: string }>();
  const [error, setError] = useState("");
  const active = tokens.filter((token) => !token.revokedAt && (!token.expiresAt || new Date(token.expiresAt) > new Date()));

  function create() {
    setError("");
    startTransition(async () => {
      const result = await createProjectApiToken(projectId, { name, scopes, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "" });
      if (result.error || !result.rawToken || !result.tokenId) return setError(result.error ?? "Could not create token.");
      setRaw({ tokenId: result.tokenId, value: result.rawToken }); setName(""); router.refresh();
    });
  }

  return <div className="space-y-7">
    <Card><CardHeader><h2 className="text-lg font-semibold">Create token</h2><p className="mt-1 text-sm text-slate-500">The raw token is returned once. If it is lost, revoke it and create another.</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="space-y-1 text-sm font-medium">Name<Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label className="space-y-1 text-sm font-medium">Expires at (optional)<Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label></div><fieldset><legend className="mb-2 text-sm font-medium">Scopes</legend><div className="flex flex-wrap gap-3">{apiTokenScopes.map((scope) => <label className="flex items-center gap-2 text-sm" key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => setScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope])} />{scope}</label>)}</div></fieldset><Button disabled={pending || !name.trim() || scopes.length === 0} onClick={create}>{pending ? "Creating…" : "Create API token"}</Button>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {raw && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="font-semibold text-amber-950">Copy this token now</p><p className="mt-1 text-sm text-amber-800">It cannot be recovered after this page is refreshed.</p><div className="mt-3 flex gap-2"><Input aria-label="New raw API token" readOnly value={raw.value} /><Button variant="secondary" onClick={() => navigator.clipboard.writeText(raw.value)}>Copy</Button></div></div>}
    </CardContent></Card>

    <Card className="overflow-hidden"><CardHeader><h2 className="text-lg font-semibold">Project tokens</h2></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Token</th><th className="px-5 py-3">Scopes</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Last used</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y">{tokens.map((token) => <tr key={token.id}><td className="px-5 py-4"><p className="font-semibold">{token.name}</p><p className="font-mono text-xs text-slate-500">{token.prefix}… · {token.createdBy?.name ?? "Deleted user"}</p></td><td className="max-w-xs px-5 py-4 text-xs">{token.scopes.join(", ")}</td><td className="px-5 py-4">{new Date(token.createdAt).toLocaleString()}<p className="text-xs text-slate-500">Expires {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : "never"}</p></td><td className="px-5 py-4">{token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}</td><td className="px-5 py-4">{status(token)}</td><td className="px-5 py-4"><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { const next = window.prompt("Token name", token.name); if (next) startTransition(async () => { const result = await renameProjectApiToken(projectId, token.id, next); if (result.error) setError(result.error); else router.refresh(); }); }}>Rename</Button>{!token.revokedAt && <Button size="sm" variant="destructive" onClick={() => { if (window.confirm(`Revoke ${token.name}? Existing clients will immediately lose access.`)) startTransition(async () => { const result = await revokeProjectApiToken(projectId, token.id); if (result.error) setError(result.error); else { if (raw?.tokenId === token.id) setRaw(undefined); router.refresh(); } }); }}>Revoke</Button>}</div></td></tr>)}</tbody></table></div>{tokens.length === 0 && <CardContent className="py-12 text-center text-sm text-slate-500">No API tokens yet.</CardContent>}</Card>

    <Playground key={raw?.tokenId ?? "playground"} tokens={active} initialRaw={raw} />
  </div>;
}

function Playground({ tokens, initialRaw }: { tokens: Token[]; initialRaw?: { tokenId: string; value: string } }) {
  const [tokenId, setTokenId] = useState(initialRaw?.tokenId ?? tokens[0]?.id ?? "");
  const [token, setToken] = useState(initialRaw?.value ?? "");
  const [endpoint, setEndpoint] = useState<Endpoint>("tasks-list");
  const [resourceId, setResourceId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [candidate, setCandidate] = useState("hello");
  const [body, setBody] = useState(taskExample);
  const [result, setResult] = useState<{ status: number; headers: string; body: string; duration: number }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const definition = endpoints[endpoint];
  const requestBody = endpoint === "tasks-create" ? body : endpoint === "verification" ? JSON.stringify({ taskId, candidate }, null, 2) : "";
  const path = definition.path(resourceId);
  const curl = useMemo(() => `curl -i -X ${definition.method} '${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}${path}' \\\n+  -H 'Authorization: Bearer ${token || "<token>"}'${requestBody ? ` \\\n+  -H 'Content-Type: application/json' \\\n+  --data ${shellQuote(requestBody)}` : ""}`, [definition.method, path, requestBody, token]);

  async function execute() {
    setError(""); setResult(undefined);
    if (!token.startsWith("vfl_")) return setError("Paste a valid vfl_ token.");
    if ((endpoint === "dataset" || endpoint === "job") && !resourceId.trim()) return setError("Enter a resource ID.");
    if (endpoint === "verification" && !taskId.trim()) return setError("Enter a task ID.");
    if (requestBody) { try { JSON.parse(requestBody); } catch { return setError("Request body must be valid JSON."); } }
    setLoading(true); const started = performance.now();
    try {
      const response = await fetch(path, { method: definition.method, headers: { Authorization: `Bearer ${token}`, ...(requestBody ? { "Content-Type": "application/json" } : {}) }, ...(requestBody ? { body: requestBody } : {}) });
      const text = await response.text();
      let formatted = text; try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* non-JSON response */ }
      setResult({ status: response.status, headers: [...response.headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n"), body: formatted, duration: performance.now() - started });
    } catch { setError("The API request could not be completed."); }
    finally { setLoading(false); }
  }

  return <Card><CardHeader><h2 className="text-lg font-semibold">API Playground</h2><p className="mt-1 text-sm text-slate-500">Requests go through the real bearer-authenticated API. Raw values remain only in this browser tab.</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="space-y-1 text-sm font-medium">Project token<select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3" value={tokenId} onChange={(event) => { setTokenId(event.target.value); setToken(event.target.value === initialRaw?.tokenId ? initialRaw.value : ""); }}>{tokens.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.prefix}…</option>)}</select></label><label className="space-y-1 text-sm font-medium">Endpoint<select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3" value={endpoint} onChange={(event) => setEndpoint(event.target.value as Endpoint)}>{Object.entries(endpoints).map(([key, value]) => <option key={key} value={key}>{value.method} · {value.label}</option>)}</select></label></div><label className="space-y-1 text-sm font-medium">Raw token (not stored)<Input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="vfl_…" /></label>{(endpoint === "dataset" || endpoint === "job") && <label className="space-y-1 text-sm font-medium">{endpoint === "dataset" ? "Dataset" : "Job"} ID<Input value={resourceId} onChange={(event) => setResourceId(event.target.value)} /></label>}{endpoint === "verification" && <div className="grid gap-4 md:grid-cols-2"><label className="space-y-1 text-sm font-medium">Task ID<Input value={taskId} onChange={(event) => setTaskId(event.target.value)} /></label><label className="space-y-1 text-sm font-medium">Candidate<Input value={candidate} onChange={(event) => setCandidate(event.target.value)} /></label></div>}{endpoint === "tasks-create" && <label className="space-y-1 text-sm font-medium">JSON body<Textarea className="min-h-72 font-mono text-xs" value={body} onChange={(event) => setBody(event.target.value)} /></label>}<div><p className="mb-2 text-sm font-medium">Equivalent cURL</p><pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{curl}</pre></div><Button disabled={loading} onClick={execute}>{loading ? "Sending…" : "Execute request"}</Button>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}{result && <div className="grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Status · {result.status} · {result.duration.toFixed(1)} ms</p><pre className="min-h-24 overflow-x-auto rounded-lg bg-slate-100 p-4 text-xs">{result.headers || "No response headers"}</pre></div><div><p className="mb-2 text-sm font-medium">Response body</p><pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{result.body || "(empty)"}</pre></div></div>}</CardContent></Card>;
}

function status(token: Token) { if (token.revokedAt) return "Revoked"; if (token.expiresAt && new Date(token.expiresAt) <= new Date()) return "Expired"; return "Active"; }
function shellQuote(value: string) { return `'${value.replaceAll("'", `'\\''`)}'`; }
