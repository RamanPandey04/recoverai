"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PaymentCase } from "@recoverai/domain";
import { Shell } from "../../components/shell";
import { PageTitle } from "../../components/ui";
import { api, inr, label, pct } from "../../lib/api";
import { AlertTriangle, ShieldCheck } from "../../components/icons";

export default function ReviewPage() {
  const [items, setItems] = useState<PaymentCase[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => { try { setItems(await api<PaymentCase[]>("/escalations")); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load review queue"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (id: string, resolution: "MARK_REVIEWED" | "STOP_RECOVERY") => { setBusy(id); setError(""); try { await api(`/escalations/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Resolution failed"); } finally { setBusy(""); } };
  return <Shell><PageTitle eyebrow="Manual safety gate" title="Human review queue" description="High-risk, ambiguous, and policy-blocked cases remain non-executable until an operator resolves them."/>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="panel h-80 animate-pulse bg-slate-100"/> : items.length === 0 ? <div className="panel grid min-h-80 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck/></span><h2 className="mt-4 text-base">Queue is clear</h2><p className="text-xs text-slate-400">Run RecoverAI from Command center to populate policy escalations.</p></div></div> : <div className="space-y-4">{items.map(item => <article key={item.id} className={`panel grid grid-cols-[1fr_1.1fr_auto] items-center gap-6 border-l-4 p-5 max-xl:grid-cols-1 ${item.demoTags.includes("GOLDEN_GUARDRAIL") ? "border-l-red-500" : "border-l-amber-400"}`}><div><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-600"/><b className="text-sm">{item.customerName}</b>{item.demoTags.includes("GOLDEN_GUARDRAIL") && <span className="badge bg-red-50 text-red-700">Golden B</span>}</div><div className="metric-number mt-3 text-xl font-semibold">{inr(item.amount)}</div><div className="mt-1 text-[11px] text-slate-400">{item.externalPaymentId} · {item.paymentMethod}</div></div><div className="grid grid-cols-3 gap-3 text-xs"><Info name="Failure" value={label(item.failureCategory ?? "UNKNOWN")}/><Info name="AI suggested" value={label(item.aiDecision?.recommendedAction ?? "NONE")}/><Info name="Risk" value={pct(item.riskScore)}/><div className="col-span-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700"><b>Policy override · {item.policyDecision?.rule}:</b> {item.policyDecision?.reason}</div></div><div className="flex flex-col gap-2"><Link href={`/cases/${item.id}`} className="rounded-lg bg-ink px-4 py-2 text-center text-xs font-semibold text-white">Inspect decision</Link><button disabled={busy === item.id} onClick={() => void resolve(item.id, "MARK_REVIEWED")} className="rounded-lg border border-line px-4 py-2 text-xs font-semibold disabled:opacity-50">Mark reviewed</button><button disabled={busy === item.id} onClick={() => void resolve(item.id, "STOP_RECOVERY")} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Stop recovery</button></div></article>)}</div>}
  </Shell>;
}
function Info({ name, value }: { name: string; value: string }) { return <div><div className="text-[10px] text-slate-400">{name}</div><b className="mt-1 block">{value}</b></div>; }
