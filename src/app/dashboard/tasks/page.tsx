import { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import {
  parseTaskSearchParams,
  TASK_PAGE_SIZE,
  taskDifficulties,
  taskSearchHref,
  taskSorts,
  taskStatuses,
  taskVerifierTypes,
} from "@/lib/task-search";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default async function TasksPage({ searchParams }: PageProps) {
  const search = parseTaskSearchParams(await searchParams);
  const conditions = taskConditions(search);
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const [projects, tags, countRows] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT CAST(tag.value AS TEXT) AS tag
      FROM "Task" task, json_each(task.tags) tag
      WHERE CAST(tag.value AS TEXT) <> ''
      ORDER BY tag COLLATE NOCASE ASC
    `,
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total FROM "Task" task ${where}
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE));
  const currentPage = Math.min(search.page, totalPages);
  const offset = (currentPage - 1) * TASK_PAGE_SIZE;
  const orderBy = taskOrderBy(search.sort);
  const idRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT task.id FROM "Task" task ${where}
    ORDER BY ${orderBy}
    LIMIT ${TASK_PAGE_SIZE} OFFSET ${offset}
  `);
  const ids = idRows.map(({ id }) => id);
  const unorderedTasks = ids.length === 0 ? [] : await prisma.task.findMany({
    where: { id: { in: ids } },
    include: { project: { select: { name: true } } },
  });
  const tasksById = new Map(unorderedTasks.map((task) => [task.id, task]));
  const tasks = ids.flatMap((id) => {
    const task = tasksById.get(id);
    return task ? [task] : [];
  });
  const hasFilters = Boolean(search.q || search.projectId || search.status || search.difficulty || search.verifierType || search.tag);

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-1 text-sm font-semibold text-indigo-600">Workspace</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Tasks</h1>
        <p className="mt-2 text-slate-500">Search and browse verifiable tasks across projects.</p>
      </div>

      <Card>
        <CardContent className="py-5">
          <form className="grid gap-4 lg:grid-cols-4" method="get">
            <FilterField className="lg:col-span-2" label="Search">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" defaultValue={search.q} name="q" placeholder="Search title or prompt" /></div>
            </FilterField>
            <FilterField label="Project"><select className={selectClass} defaultValue={search.projectId} name="project"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FilterField>
            <FilterField label="Status"><select className={selectClass} defaultValue={search.status} name="status"><option value="">All statuses</option>{taskStatuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField>
            <FilterField label="Difficulty"><select className={selectClass} defaultValue={search.difficulty} name="difficulty"><option value="">All difficulties</option>{taskDifficulties.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField>
            <FilterField label="Verifier"><select className={selectClass} defaultValue={search.verifierType} name="verifier"><option value="">All verifier types</option>{taskVerifierTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField>
            <FilterField label="Tag"><select className={selectClass} defaultValue={search.tag} name="tag"><option value="">All tags</option>{tags.map(({ tag }) => <option key={tag} value={tag}>{tag}</option>)}</select></FilterField>
            <FilterField label="Sort"><select className={selectClass} defaultValue={search.sort} name="sort">{taskSorts.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField>
            <div className="flex items-end gap-2 lg:col-span-4">
              <button className={buttonVariants()} type="submit">Apply</button>
              <Link className={buttonVariants({ variant: "secondary" })} href="/dashboard/tasks">Reset filters</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {tasks.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><Search className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold text-slate-900">{hasFilters ? "No matching tasks" : "No tasks yet"}</h2><p className="mt-1 text-sm text-slate-500">{hasFilters ? "Try changing or resetting the current filters." : "Create a task inside a project to see it here."}</p>{hasFilters && <Link className={buttonVariants({ variant: "secondary", className: "mt-5" })} href="/dashboard/tasks">Reset filters</Link>}</CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between"><h2 className="font-semibold text-slate-950">{total} {total === 1 ? "task" : "tasks"}</h2><span className="text-sm text-slate-500">Page {currentPage} of {totalPages}</span></CardHeader>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Task</th><th className="px-5 py-3 font-semibold">Project</th><th className="px-5 py-3 font-semibold">Verifier</th><th className="px-5 py-3 font-semibold">Difficulty</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{tasks.map((task) => <tr className="transition-colors hover:bg-slate-50" key={task.id}><td className="max-w-80 px-5 py-4"><Link className="block truncate font-semibold text-slate-900 hover:text-indigo-600" href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link><p className="mt-1 truncate text-xs text-slate-500">{tagsFrom(task.tags).join(", ") || "No tags"}</p></td><td className="px-5 py-4 text-slate-500">{task.project.name}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{label(task.verifierType)}</td><td className="px-5 py-4 text-slate-500">{label(task.difficulty)}</td><td className="px-5 py-4"><Badge>{task.status}</Badge></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{task.createdAt.toLocaleDateString()}</td></tr>)}</tbody></table></div>
          <CardContent className="flex items-center justify-between border-t border-slate-200 py-4">
            {currentPage > 1 ? <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={taskSearchHref(search, currentPage - 1)}><ChevronLeft className="mr-1 size-4" />Previous</Link> : <span />}
            {currentPage < totalPages && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={taskSearchHref(search, currentPage + 1)}>Next<ChevronRight className="ml-1 size-4" /></Link>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function taskConditions(search: ReturnType<typeof parseTaskSearchParams>) {
  const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (search.q) {
    const query = `%${search.q.toLowerCase()}%`;
    conditions.push(Prisma.sql`(LOWER(task.title) LIKE ${query} OR LOWER(task.prompt) LIKE ${query})`);
  }
  if (search.projectId) conditions.push(Prisma.sql`task.projectId = ${search.projectId}`);
  if (search.status) conditions.push(Prisma.sql`task.status = ${search.status}`);
  if (search.difficulty) conditions.push(Prisma.sql`task.difficulty = ${search.difficulty}`);
  if (search.verifierType) conditions.push(Prisma.sql`task.verifierType = ${search.verifierType}`);
  if (search.tag) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM json_each(task.tags) tag WHERE LOWER(CAST(tag.value AS TEXT)) = ${search.tag.toLowerCase()})`);
  return conditions;
}

function taskOrderBy(sort: ReturnType<typeof parseTaskSearchParams>["sort"]) {
  switch (sort) {
    case "oldest": return Prisma.sql`task.createdAt ASC, task.id ASC`;
    case "title": return Prisma.sql`task.title COLLATE NOCASE ASC, task.id ASC`;
    case "difficulty": return Prisma.sql`CASE task.difficulty WHEN 'EASY' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HARD' THEN 3 ELSE 4 END ASC, task.title COLLATE NOCASE ASC, task.id ASC`;
    default: return Prisma.sql`task.createdAt DESC, task.id ASC`;
  }
}

function FilterField({ children, className = "", label: text }: { children: React.ReactNode; className?: string; label: string }) {
  return <label className={`grid gap-1 text-xs font-semibold text-slate-500 ${className}`}><span>{text}</span>{children}</label>;
}

function tagsFrom(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
