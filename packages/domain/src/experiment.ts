import { fallbackDecision } from "./decision.js";
import { diagnoseFailure } from "./diagnosis.js";
import { authorizeAction } from "./policy.js";
import { simulateOutcome } from "./simulator.js";
import { createExperimentPopulation } from "./dataset.js";
import { addMoney, sumMoney } from "./money.js";
import type { PaymentCase, RecoveryAction, StrategyMetrics } from "./types.js";

function emptyMetrics(strategy: StrategyMetrics["strategy"], cases: PaymentCase[]): StrategyMetrics {
  return { strategy, revenueAtRisk: sumMoney(cases.map(payment => payment.amount)), revenueRecovered: 0, recoveryRateByValue: 0, recoveredCount: 0, totalCases: cases.length, attempts: 0, customerContacts: 0, riskyActionsPrevented: 0, escalations: 0, averageAttemptsBeforeRecovery: 0, actionPerformance: {} };
}

function record(metrics: StrategyMetrics, action: RecoveryAction, success: boolean, amount: number) {
  const current = metrics.actionPerformance[action] ?? { attempts: 0, successes: 0, revenue: 0 };
  current.attempts += 1;
  if (success) { current.successes += 1; current.revenue = addMoney(current.revenue, amount); }
  metrics.actionPerformance[action] = current;
}

function finish(metrics: StrategyMetrics) {
  metrics.recoveryRateByValue = metrics.revenueAtRisk ? metrics.revenueRecovered / metrics.revenueAtRisk : 0;
  // Each evaluation strategy gets one intervention opportunity per case.
  // Failed cases must not inflate "attempts before recovery" for successful cases.
  metrics.averageAttemptsBeforeRecovery = metrics.recoveredCount ? 1 : 0;
  return metrics;
}

export function runBaseline(cases: PaymentCase[]): StrategyMetrics {
  const population = createExperimentPopulation(cases);
  const m = emptyMetrics("BASELINE", population);
  for (const payment of population) {
    const diagnosis = payment.diagnosis ?? diagnoseFailure(payment);
    if (payment.retryCount >= payment.maxRetries || payment.manuallyStopped || ["RISK_OR_FRAUD", "PERMANENT_FAILURE"].includes(diagnosis.category)) continue;
    m.attempts += 1;
    const outcome = simulateOutcome(payment, "RETRY_LATER", 0);
    record(m, "RETRY_LATER", outcome.success, payment.amount);
    if (outcome.success) { m.recoveredCount += 1; m.revenueRecovered = addMoney(m.revenueRecovered, payment.amount); }
  }
  return finish(m);
}

export function runRecoverAi(cases: PaymentCase[]): StrategyMetrics {
  const population = createExperimentPopulation(cases);
  const m = emptyMetrics("RECOVERAI", population);
  for (const payment of population) {
    const diagnosis = payment.diagnosis ?? diagnoseFailure(payment);
    const ai = fallbackDecision(payment, diagnosis);
    const policy = authorizeAction(payment, diagnosis, ai, new Date("2026-09-01T12:00:00.000Z"));
    if (!policy.approved) {
      if (policy.finalAction === "HUMAN_REVIEW") m.escalations += 1;
      if (policy.rule === "HIGH_RISK") m.riskyActionsPrevented += 1;
      continue;
    }
    if (["STOP", "HUMAN_REVIEW"].includes(policy.finalAction)) { if (policy.finalAction === "HUMAN_REVIEW") m.escalations += 1; continue; }
    m.attempts += 1;
    if (["SEND_REMINDER", "SWITCH_PAYMENT_METHOD"].includes(policy.finalAction)) m.customerContacts += 1;
    const outcome = simulateOutcome(payment, policy.finalAction, ai.retryAfterMinutes ?? 20);
    record(m, policy.finalAction, outcome.success, payment.amount);
    if (outcome.success) { m.recoveredCount += 1; m.revenueRecovered = addMoney(m.revenueRecovered, payment.amount); }
  }
  return finish(m);
}
