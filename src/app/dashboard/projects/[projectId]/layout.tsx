import { notFound } from "next/navigation";
import { getProjectActor } from "@/lib/auth";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!await getProjectActor(projectId)) notFound();
  return children;
}
