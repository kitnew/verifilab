"use client";

import { Button } from "@/components/ui/button";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) { return <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center"><h2 className="font-semibold text-red-900">Job Center could not be loaded</h2><p className="mt-2 text-sm text-red-700">Try the request again.</p><Button className="mt-4" onClick={reset}>Retry</Button></div>; }
