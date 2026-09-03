import { authorizeAction, authorizeManualAction, diagnoseFailure, simulateOutcome, type PaymentCase, type RecoveryAction } from "@recoverai/domain";
import { AppError } from "../errors.js";
import type { Repository } from "../repository.js";
import { audit } from "../audit.js";
import { AiDecisionService } from "./ai-service.js";

export class RecoveryService {
  constructor(private repo: Repository, private ai = new AiDecisionService()) {}
  async diagnose(id: string) {
    const payment = await this.required(id);
    payment.diagnosis = diagnoseFailure(payment); payment.failureCategory = payment.diagnosis.category;
    if (!payment.audit.some(event => event.eventType === "FAILURE_DIAGNOSED")) {
      audit(payment, "FAILURE_DIAGNOSED", "SYSTEM", payment.diagnosis.explanation, { confidence: payment.diagnosis.confidence, category: payment.diagnosis.category });
    }
    await this.repo.save(payment); return payment;
  }
  async plan(id: string) {
    let payment = await this.required(id);
    if (["RECOVERED", "STOPPED", "ABANDONED"].includes(payment.status)) throw new AppError(409, "This case is in a terminal state", "TERMINAL_CASE");
    if (["RECOVERY_PLANNED", "ESCALATED"].includes(payment.status) && payment.aiDecision && payment.policyDecision) return payment;
    payment = await this.diagnose(id);
    const { decision, source } = await this.ai.decide(payment, payment.diagnosis!);
    payment.aiDecision = decision; payment.recoverabilityScore = decision.recoverability; payment.riskScore = Math.max(payment.riskScore, decision.riskScore);
    audit(payment, "AI_DECISION_CREATED", "AI", decision.reasoningSummary, { source, confidence: decision.confidence, recommendation: decision.recommendedAction });
    payment.policyDecision = authorizeAction(payment, payment.diagnosis!, decision);
    const event = payment.policyDecision.approved ? "POLICY_APPROVED" : "POLICY_OVERRIDDEN";
    audit(payment, event, "POLICY", payment.policyDecision.reason, { rule: payment.policyDecision.rule, aiAction: decision.recommendedAction, finalAction: payment.policyDecision.finalAction });
    payment.status = payment.policyDecision.finalAction === "HUMAN_REVIEW" ? "ESCALATED" : payment.policyDecision.finalAction === "STOP" ? "STOPPED" : "RECOVERY_PLANNED";
    await this.repo.save(payment); return payment;
  }
  async execute(id: string, requestedAction?: RecoveryAction, idempotencyKey?: string) {
    let payment = await this.required(id);
    if (!payment.policyDecision) payment = await this.plan(id);
    const action = requestedAction ?? payment.policyDecision!.finalAction;
    if (action !== payment.policyDecision!.finalAction) throw new AppError(409, "Requested action differs from the policy-authorized action", "POLICY_MISMATCH");
    const executionFingerprint = `${payment.id}:${action}:${payment.retryCount}:${payment.contactCount}`;
    const key = idempotencyKey ?? executionFingerprint;
    const existing = payment.attempts.find(a => a.idempotencyKey === key);
    if (existing) return { payment, attempt: existing, duplicate: true };
    const freshPolicy = payment.policyDecision!.rule === "MANUAL_REVIEW_APPROVED"
      ? authorizeManualAction(payment, payment.diagnosis!, action)
      : authorizeAction(payment, payment.diagnosis!, payment.aiDecision!);
    if (freshPolicy.rule !== payment.policyDecision!.rule || freshPolicy.finalAction !== payment.policyDecision!.finalAction) {
      payment.policyDecision = freshPolicy;
      audit(payment, "POLICY_RECHECK_OVERRIDDEN", "POLICY", freshPolicy.reason, { rule: freshPolicy.rule, finalAction: freshPolicy.finalAction });
    }
    if (!payment.policyDecision!.approved || ["HUMAN_REVIEW", "STOP"].includes(action)) {
      const finalAction = payment.policyDecision!.finalAction;
      const eventType = finalAction === "HUMAN_REVIEW" ? "CASE_ESCALATED" : "CASE_STOPPED";
      if (!payment.audit.some(event => event.eventType === eventType)) audit(payment, eventType, "POLICY", payment.policyDecision!.reason);
      payment.status = finalAction === "HUMAN_REVIEW" ? "ESCALATED" : "STOPPED";
      await this.repo.save(payment); return { payment, attempt: null, duplicate: false };
    }
    if (payment.status !== "RECOVERY_PLANNED" && payment.status !== "FAILED") throw new AppError(409, "Case is not executable in its current state", "INVALID_CASE_STATE");
    // A client key identifies its request, but cannot redefine the financial
    // operation. The server fingerprint collapses different keys for one attempt.
    if (!await this.repo.claimExecution(payment.id, executionFingerprint)) {
      const latest = await this.required(id);
      const claimedAttempt = latest.attempts.find(attempt => attempt.idempotencyKey === key);
      if (claimedAttempt) return { payment: latest, attempt: claimedAttempt, duplicate: true };
      throw new AppError(409, "An execution with this idempotency key is already in progress", "EXECUTION_IN_PROGRESS");
    }
    payment.status = "RECOVERING";
    audit(payment, "RECOVERY_EXECUTION_STARTED", "SYSTEM", "Policy-authorized simulation execution claimed idempotently.", { action, idempotencyKey: key });
    await this.repo.save(payment);
    const outcome = simulateOutcome(payment, action, payment.aiDecision?.retryAfterMinutes ?? 20);
    const attempt = { id: `attempt-${payment.id}-${payment.attempts.length + 1}`, action, mode: "SIMULATION" as const, idempotencyKey: key, success: outcome.success, outcome: outcome.success ? "Payment recovered in deterministic simulation" : "Recovery action completed without payment recovery", createdAt: new Date().toISOString() };
    payment.attempts.push(attempt);
    if (action === "RETRY_LATER") payment.retryCount += 1;
    if (["SEND_REMINDER", "SWITCH_PAYMENT_METHOD"].includes(action)) { payment.contactCount += 1; payment.lastContactAt = new Date().toISOString(); }
    audit(payment, "RECOVERY_EXECUTED", "SYSTEM", attempt.outcome, { action, probability: outcome.probability, simulation: true });
    if (outcome.success) { payment.status = "RECOVERED"; payment.recoveredAmount = payment.amount; audit(payment, "PAYMENT_RECOVERED", "SYSTEM", `Recovered INR ${payment.amount} in simulation.`, { amount: payment.amount }); }
    else {
      payment.status = payment.retryCount >= payment.maxRetries ? "STOPPED" : "FAILED";
      audit(payment, "RECOVERY_FAILED", "SYSTEM", "The simulated intervention did not recover the payment.");
      if (payment.status === "STOPPED") audit(payment, "CASE_STOPPED", "POLICY", "Retry limit reached after the failed simulated intervention.", { rule: "MAX_RETRY_LIMIT_REACHED" });
    }
    await this.repo.save(payment); return { payment, attempt, duplicate: false };
  }
  private async required(id: string) { const payment = await this.repo.get(id); if (!payment) throw new AppError(404, "Payment case not found", "CASE_NOT_FOUND"); return payment; }
}
