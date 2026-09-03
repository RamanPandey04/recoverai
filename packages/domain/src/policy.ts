import type { AiDecision, Diagnosis, PaymentCase, PolicyDecision, RecoveryAction } from "./types.js";

const result = (approved: boolean, finalAction: RecoveryAction, rule: string, reason: string): PolicyDecision => ({ approved, finalAction, rule, reason });

export function authorizeAction(payment: PaymentCase, diagnosis: Diagnosis, ai: AiDecision, now = new Date()): PolicyDecision {
  if (payment.status === "RECOVERED" || payment.recoveredAmount > 0) return result(false, "STOP", "ALREADY_RECOVERED", "Recovered payments cannot receive another recovery action.");
  if (payment.manuallyStopped || payment.status === "STOPPED") return result(false, "STOP", "MANUALLY_STOPPED", "An operator stopped this recovery case.");
  if (payment.status === "ABANDONED") return result(false, "STOP", "CASE_ABANDONED", "Abandoned cases cannot be recovered automatically.");
  if (payment.status === "RECOVERING") return result(false, "HUMAN_REVIEW", "EXECUTION_IN_PROGRESS", "Another recovery execution is already in progress.");
  if (diagnosis.category === "RISK_OR_FRAUD" || ai.riskScore >= 0.75) return result(false, "HUMAN_REVIEW", "HIGH_RISK", "High-risk conditions prohibit automated recovery.");
  if (diagnosis.category === "PERMANENT_FAILURE") return result(false, "STOP", "PERMANENT_FAILURE", "This failure cannot be recovered by another attempt.");
  if (ai.recommendedAction === "RETRY_LATER" && !diagnosis.safeToRetry) return result(false, "HUMAN_REVIEW", "UNSAFE_RETRY_FOR_DIAGNOSIS", "The diagnosed failure is not safe for an automated retry.");
  if (ai.recommendedAction === "RETRY_LATER" && payment.retryCount >= payment.maxRetries) return result(false, "HUMAN_REVIEW", "MAX_RETRY_LIMIT_REACHED", "The configured retry limit has been reached.");
  if (ai.confidence < 0.62 || diagnosis.category === "UNKNOWN") return result(false, "HUMAN_REVIEW", "LOW_CONFIDENCE", "Ambiguous or low-confidence decisions require review.");
  if (ai.expectedRecoveryProbability < 0.12 && !["STOP", "HUMAN_REVIEW"].includes(ai.recommendedAction)) return result(false, "STOP", "LOW_EXPECTED_VALUE", "Expected recovery value is below the safe action threshold.");
  if (["SEND_REMINDER", "SWITCH_PAYMENT_METHOD"].includes(ai.recommendedAction)) {
    if (payment.contactCount >= payment.maxContacts) return result(false, "STOP", "CONTACT_LIMIT_REACHED", "Customer contact limit has been reached.");
    if (payment.lastContactAt && now.getTime() - new Date(payment.lastContactAt).getTime() < 24 * 60 * 60 * 1000) return result(false, "HUMAN_REVIEW", "CONTACT_COOLDOWN", "Customer was contacted within the 24-hour cooldown.");
  }
  return result(true, ai.recommendedAction, "APPROVED", "The proposed action satisfies all deterministic safety policies.");
}

export function authorizeManualAction(payment: PaymentCase, diagnosis: Diagnosis, action: RecoveryAction, now = new Date()): PolicyDecision {
  if (payment.status === "RECOVERED" || payment.recoveredAmount > 0) return result(false, "STOP", "ALREADY_RECOVERED", "Recovered payments cannot receive another recovery action.");
  if (payment.manuallyStopped || ["STOPPED", "ABANDONED"].includes(payment.status)) return result(false, "STOP", "MANUALLY_STOPPED", "This case has been stopped.");
  if (diagnosis.category === "RISK_OR_FRAUD") return result(false, "HUMAN_REVIEW", "HIGH_RISK", "Fraud-risk cases cannot be released to automatic execution.");
  if (diagnosis.category === "PERMANENT_FAILURE") return result(false, "STOP", "PERMANENT_FAILURE", "Permanent failures cannot be manually released for execution.");
  if (action === "RETRY_LATER" && (!diagnosis.safeToRetry || payment.retryCount >= payment.maxRetries)) return result(false, "HUMAN_REVIEW", "UNSAFE_MANUAL_RETRY", "This case is not eligible for another retry.");
  if (["SEND_REMINDER", "SWITCH_PAYMENT_METHOD"].includes(action)) {
    if (payment.contactCount >= payment.maxContacts) return result(false, "STOP", "CONTACT_LIMIT_REACHED", "Customer contact limit has been reached.");
    if (payment.lastContactAt && now.getTime() - new Date(payment.lastContactAt).getTime() < 24 * 60 * 60 * 1000) return result(false, "HUMAN_REVIEW", "CONTACT_COOLDOWN", "Customer was contacted within the 24-hour cooldown.");
  }
  return result(true, action, "MANUAL_REVIEW_APPROVED", "A human operator reviewed the case and authorized this bounded action.");
}
