import { addMoney, sumMoney, type PaymentCase, type StrategyMetrics } from "@recoverai/domain";

export function calculateAnalytics(cases: PaymentCase[], experiments: StrategyMetrics[] = []) {
  const totalFailedRevenue = sumMoney(cases.map(payment => payment.amount));
  const totalRecoveredRevenue = sumMoney(cases.map(payment => payment.recoveredAmount));
  const recovered = cases.filter(c => c.status === "RECOVERED");
  const actionStats: Record<string, { attempts: number; successes: number; revenue: number }> = {};
  for (const c of cases) for (const a of c.attempts) {
    const stat = actionStats[a.action] ?? { attempts: 0, successes: 0, revenue: 0 };
    stat.attempts += 1; if (a.success) { stat.successes += 1; stat.revenue = addMoney(stat.revenue, c.amount); } actionStats[a.action] = stat;
  }
  const categories = Object.entries(cases.reduce<Record<string, { cases: number; revenue: number; recovered: number }>>((acc, c) => {
    const key = c.failureCategory ?? "UNKNOWN"; const item = acc[key] ?? { cases: 0, revenue: 0, recovered: 0 };
    item.cases += 1; item.revenue = addMoney(item.revenue, c.amount); item.recovered = addMoney(item.recovered, c.recoveredAmount); acc[key] = item; return acc;
  }, {})).map(([category, value]) => ({ category, ...value }));
  return {
    totalFailedRevenue, totalRecoveredRevenue,
    recoveryPercentageByValue: totalFailedRevenue ? totalRecoveredRevenue / totalFailedRevenue : 0,
    recoveryPercentageByCount: cases.length ? recovered.length / cases.length : 0,
    averageRecoveryProbability: cases.length ? cases.reduce((s, c) => s + (c.aiDecision?.expectedRecoveryProbability ?? 0), 0) / cases.length : 0,
    activeCases: cases.filter(c => ["FAILED", "RECOVERY_PLANNED", "RECOVERING"].includes(c.status)).length,
    totalFailedPayments: cases.length,
    humanEscalations: cases.filter(c => c.status === "ESCALATED").length,
    unsafeActionsPrevented: cases.filter(c => c.policyDecision?.rule === "HIGH_RISK").length,
    potentialRecoveryRemaining: sumMoney(cases.filter(c => !["RECOVERED", "STOPPED"].includes(c.status)).map(c => c.amount * (c.recoverabilityScore ?? 0))),
    averageAttemptsBeforeRecovery: recovered.length ? recovered.reduce((s, c) => s + c.attempts.length, 0) / recovered.length : 0,
    actionPerformance: actionStats, failureCategoryPerformance: categories, experiments
  };
}
