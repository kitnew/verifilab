export default function Loading() {
  return <div className="space-y-6" aria-label="Loading"><div className="h-9 w-52 animate-pulse rounded bg-slate-200" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-200" />)}</div><div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-200" />)}</div></div>;
}
