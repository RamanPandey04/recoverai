"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, ClipboardCheck, Command, CreditCard, LayoutDashboard, ShieldCheck } from "./icons";

const nav = [
  ["/", "Overview", LayoutDashboard], ["/cases", "Payment cases", CreditCard], ["/command-center", "Command center", Command], ["/review", "Human review", ClipboardCheck]
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  return <div className="app-grid grid min-h-screen grid-cols-[232px_1fr]">
    <aside className="sidebar sticky top-0 flex h-screen flex-col border-r border-slate-800 bg-navy px-4 py-5 text-white">
      <div className="mb-8 flex items-center gap-3 px-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue"><Bot size={19}/></span><div><div className="text-[15px] font-bold">RecoverAI</div><div className="text-[10px] text-slate-400">AI Revenue Recovery Agent</div></div></div>
      <nav className="space-y-1">{nav.map(([href, text, Icon]) => { const active = href === "/" ? path === href : path.startsWith(href); return <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17}/>{text}</Link>; })}</nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15} className="text-emerald-400"/>Simulation mode</div><p className="mb-0 mt-2 text-[11px] leading-5 text-slate-400">No live financial actions. Policy controls are enforced.</p></div>
    </aside>
    <main className="min-w-0"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/90 px-7 backdrop-blur"><div className="flex items-center gap-2 text-sm text-slate-500"><BarChart3 size={16}/><span>Payment Operations</span><span className="text-slate-300">/</span><span className="font-medium text-ink">{nav.find(([href]) => href === path)?.[1] ?? "Case details"}</span></div><div className="flex items-center gap-3"><span className="badge bg-amber-50 text-amber-700">SIMULATION</span><div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">RO</div></div></header>
      <div className="mx-auto max-w-[1500px] p-7">{children}</div>
    </main>
  </div>;
}
