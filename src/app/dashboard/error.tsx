"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <div className="grid min-h-[60vh] place-items-center text-center"><div><AlertTriangle className="mx-auto mb-4 size-10 text-red-500" /><h1 className="text-xl font-semibold">Something went wrong</h1><p className="mt-2 mb-5 text-sm text-slate-500">The workspace could not be loaded.</p><Button onClick={unstable_retry}>Try again</Button></div></div>;
}
