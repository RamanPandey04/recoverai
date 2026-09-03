import { label } from "../lib/api";

export function StatusBadge({ value }: { value: string }) {
  const cls = ["RECOVERED", "APPROVED", "SAFE_TO_RETRY"].includes(value) ? "bg-emerald-50 text-emerald-700" : ["ESCALATED", "HUMAN_REVIEW", "ACTION_REQUIRED"].includes(value) ? "bg-amber-50 text-amber-700" : ["STOPPED", "HIGH_RISK", "OVERRIDDEN", "DENIED"].includes(value) ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";
  return <span className={`badge whitespace-nowrap ${cls}`}>{label(value)}</span>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex items-end justify-between gap-4"><div><div className="eyebrow mb-2">{eyebrow}</div><h1 className="m-0 text-2xl font-semibold tracking-tight">{title}</h1><p className="mb-0 mt-2 text-sm text-slate-500">{description}</p></div>{action}</div>;
}

export function Skeleton({ className = "h-24" }: { className?: string }) { return <div className={`${className} animate-pulse rounded-xl bg-slate-200/70`}/>; }
