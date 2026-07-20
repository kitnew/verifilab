import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return <div className="grid min-h-[60vh] place-items-center text-center"><div><p className="text-sm font-semibold text-indigo-600">404</p><h1 className="mt-2 text-2xl font-bold">Item not found</h1><p className="mt-2 mb-5 text-slate-500">It may have been deleted or the link is incorrect.</p><Link href="/dashboard" className={buttonVariants()}>Back to projects</Link></div></div>;
}
