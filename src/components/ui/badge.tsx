import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  DRAFT: "bg-slate-100 text-slate-700",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  ERROR: "bg-red-100 text-red-800",
  WARNING: "bg-amber-100 text-amber-800",
  INFO: "bg-blue-100 text-blue-800",
};

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const key = String(children) as keyof typeof tones;
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[key] ?? "bg-indigo-50 text-indigo-700", className)}
      {...props}
    >
      {children}
    </span>
  );
}
