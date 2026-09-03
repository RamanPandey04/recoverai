"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PaymentCase, StrategyMetrics } from "@recoverai/domain";
import { api, inr, label, pct } from "../lib/api";
import { Shell } from "../components/shell";
import { ArrowUpRight, CircleDollarSign, Gauge, ShieldCheck, Sparkles, Users } from "../components/icons";
import { PageTitle, Skeleton, StatusBadge } from "../components/ui";

type Analytics = { totalFailedRevenue: number; totalRecoveredRevenue: number; recoveryPercentageByValue: number; humanEscalations: number; unsafeActionsPrevented: number; failureCategoryPerformance: Array<{ category: string; cases: number; revenue: number; recovered: number }>; experiments: StrategyMetrics[] };
const colors = ["#3566e8", "#20a47b", "#e3a13d", "#8b6fc6", "#d85b68", "#6d7b91", "#43a8bd", "#9a785c"];

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics>();
  const [cases, setCases] = useState<PaymentCase[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const [summary, payments] = await Promise.all([api<Analytics>("/analytics/summary?batchId=batch-2026"), api<PaymentCase[]>("/cases?batchId=batch-2026&sort=amount")]); setAnalytics(summary); setCases(payments); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the dashboard"); } }, []);
  useEffect(() => { void load(); }, [load]);
  const recoverai = analytics?.experiments.find(run => run.strategy === "RECOVERAI");
  const baseline = analytics?.experiments.find(run => run.strategy === "BASELINE");
  const incremental = recoverai && baseline ? recoverai.revenueRecovered - baseline.revenueRecovered : null;
  const golden = useMemo(() => cases.filter(item => item.demoTags.length > 0), [cases]);
  const comparison = baseline && recoverai ? [{ name: "Naive retry", revenue: baseline.revenueRecovered }, { name: "RecoverAI", revenue: recoverai.revenueRecovered }] : [];
  const kpis = analytics ? [
    ["Revenue at risk", inr(analytics.totalFailedRevenue), "Seeded failed-payment value", CircleDollarSign, "text-slate-700"],
    ["Simulated revenue recovered", inr(analytics.totalRecoveredRevenue), "Outcome simulator; not live money", ArrowUpRight, "text-emerald-600"],
    ["Recovery rate", pct(analytics.recoveryPercentageByValue), "By value in the materialized run", Gauge, "text-blue-600"],
    ["Incremental vs baseline", incremental === null ? "—" : inr(incremental), incremental === null ? "Run both strategies to compare" : "Additional simulated revenue", Sparkles, "text-emerald-600"],
    ["Unsafe actions prevented", String(analytics.unsafeActionsPrevented), "Blocked by deterministic policy", ShieldCheck, "text-red-600"],
    ["Human escalations", String(analytics.humanEscalations), "No autonomous execution", Users, "text-amber-600"]
  ] as const : [];
  return <Shell>
    <PageTitle eyebrow="AI Revenue Recovery Agent" title="RecoverAI" description="Understand payment failures, select the next-best intervention, and keep financial authority inside deterministic policy." action={<Link href="/command-center" className="rounded-lg bg-blue px-4 py-2.5 text-xs font-semibold text-white shadow-sm">Run demo experiment</Link>}/>
    {error && <div role="alert" className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void load()} className="font-semibold">Retry</button></div>}
    {!analytics ? <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index}/>)}</div> : <>
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-3">{kpis.map(([name, value, hint, Icon, color]) => <div key={name} className="panel p-5"><div className="flex items-start justify-between"><div><div className="text-xs font-medium text-slate-500">{name}</div><div className="metric-number mt-3 text-2xl font-semibold">{value}</div><div className="mt-1.5 text-[11px] text-slate-400">{hint}</div></div><span className={`grid h-9 w-9 place-items-center rounded-lg bg-slate-50 ${color}`}><Icon size={18}/></span></div></div>)}</section>
      <section className="mt-5 grid grid-cols-[1.35fr_.85fr] gap-5 max-xl:grid-cols-1">
        <div className="panel p-5"><div className="flex items-start justify-between"><div><div className="text-base font-semibold">Baseline vs RecoverAI</div><div className="mt-1 text-xs text-slate-500">Equivalent restored population and a common latent outcome draw per case.</div></div><span className="badge bg-blue-50 text-blue">Seed 2026</span></div>
          {comparison.length ? <><div className="mt-4 h-56"><ResponsiveContainer><BarChart data={comparison} layout="vertical" margin={{ left: 8, right: 22 }}><CartesianGrid horizontal={false} stroke="#edf0f5"/><XAxis type="number" tickFormatter={value => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 10, fill: "#8791a2" }} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#526074" }} axisLine={false} tickLine={false}/><Tooltip formatter={value => [inr(Number(value)), "Simulated recovered revenue"]}/><Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={30}>{comparison.map((_, index) => <Cell key={index} fill={index ? "#20a47b" : "#9ba7b8"}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-3"><ComparisonMetric name="Incremental revenue" value={inr(incremental ?? 0)} positive/><ComparisonMetric name="Attempts reduced" value={String(baseline!.attempts - recoverai!.attempts)}/><ComparisonMetric name="Recovery lift" value={`${Math.round((recoverai!.recoveryRateByValue - baseline!.recoveryRateByValue) * 100)} pp`} positive/></div></> : <div className="mt-5 grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center"><div><div className="text-sm font-semibold">Comparison not run yet</div><p className="mb-4 mt-1 text-xs text-slate-500">Run baseline and RecoverAI against the seed-2026 batch.</p><Link href="/command-center" className="text-xs font-semibold text-blue">Open command center →</Link></div></div>}
        </div>
        <div className="panel p-5"><div className="text-sm font-semibold">Failure mix</div><div className="mt-1 text-xs text-slate-400">Diagnosed cases by category</div><div className="mt-3 grid grid-cols-[150px_1fr] items-center"><div className="h-48"><ResponsiveContainer><PieChart><Pie data={analytics.failureCategoryPerformance} dataKey="cases" nameKey="category" innerRadius={44} outerRadius={67} paddingAngle={2}>{analytics.failureCategoryPerformance.map((_, index) => <Cell key={index} fill={colors[index % colors.length]}/>)}</Pie><Tooltip formatter={(value, name) => [value, label(String(name))]}/></PieChart></ResponsiveContainer></div><div className="space-y-2">{analytics.failureCategoryPerformance.slice(0, 6).map((item, index) => <div key={item.category} className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-2 text-slate-500"><i className="h-2 w-2 rounded-full" style={{ background: colors[index] }}/>{label(item.category)}</span><b>{item.cases}</b></div>)}</div></div></div>
      </section>
      <section className="panel mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><div className="text-sm font-semibold">Golden demo cases</div><div className="mt-1 text-xs text-slate-400">Stable cases for the recovery and guardrail stories</div></div><Link href="/cases" className="text-xs font-semibold text-blue">View all cases</Link></div><div className="grid grid-cols-2 divide-x divide-line max-lg:grid-cols-1 max-lg:divide-x-0 max-lg:divide-y">{golden.map(item => <Link key={item.id} href={`/cases/${item.id}`} className="group flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50"><div><div className="mb-2 flex items-center gap-2"><span className={`badge ${item.demoTags.includes("GOLDEN_SUCCESS") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{item.demoTags.includes("GOLDEN_SUCCESS") ? "Golden A · Recovery" : "Golden B · Guardrail"}</span><StatusBadge value={item.status}/></div><div className="font-semibold">{item.customerName} · {inr(item.amount)}</div><div className="mt-1 text-xs text-slate-500">{label(item.failureCategory ?? "UNKNOWN")} · {item.failureCode}</div></div><span className="text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue">→</span></Link>)}</div></section>
    </>}
  </Shell>;
}

function ComparisonMetric({ name, value, positive = false }: { name: string; value: string; positive?: boolean }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-[10px] text-slate-400">{name}</div><div className={`metric-number mt-1 text-base font-semibold ${positive ? "text-emerald-700" : ""}`}>{value}</div></div>; }
