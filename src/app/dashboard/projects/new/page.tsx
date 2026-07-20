import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProjectForm } from "@/components/project-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NewProjectPage() {
  return <div className="mx-auto max-w-2xl"><Link href="/dashboard" className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Projects</Link><Card><CardHeader><h1 className="text-2xl font-bold text-slate-950">Create project</h1><p className="mt-1 text-sm text-slate-500">A project groups related tasks and future datasets.</p></CardHeader><CardContent><ProjectForm /></CardContent></Card></div>;
}
