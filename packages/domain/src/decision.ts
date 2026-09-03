import { aiDecisionSchema, type AiDecision, type Diagnosis, type PaymentCase, type RecoveryAction } from "./types.js";

const actionByCategory: Record<Diagnosis["category"], RecoveryAction> = {
  TRANSIENT_TECHNICAL: "RETRY_LATER",
  CUSTOMER_ACTION_REQUIRED: "SEND_REMINDER",
  PAYMENT_METHOD_ISSUE: "SWITCH_PAYMENT_METHOD",
  AUTHENTICATION: "SEND_REMINDER",
  INSUFFICIENT_FUNDS: "SEND_REMINDER",
  PERMANENT_FAILURE: "STOP",
  RISK_OR_FRAUD: "HUMAN_REVIEW",
  UNKNOWN: "HUMAN_REVIEW"
};

const recoverability: Record<Diagnosis["category"], number> = {
  TRANSIENT_TECHNICAL: 0.84, CUSTOMER_ACTION_REQUIRED: 0.58, PAYMENT_METHOD_ISSUE: 0.63,
  AUTHENTICATION: 0.54, INSUFFICIENT_FUNDS: 0.48, PERMANENT_FAILURE: 0.05,
  RISK_OR_FRAUD: 0.2, UNKNOWN: 0.32
};

export function fallbackDecision(payment: PaymentCase, diagnosis: Diagnosis): AiDecision {
  const retryPenalty = payment.retryCount * 0.12;
  const loyaltyBoost = (payment.simulationProfile?.customerLoyalty ?? 0.5) * 0.08;
  const score = Math.max(0.02, Math.min(0.96, recoverability[diagnosis.category] - retryPenalty + loyaltyBoost));
  const action = actionByCategory[diagnosis.category];
  return aiDecisionSchema.parse({
    recoverability: score,
    riskScore: Math.max(payment.riskScore, diagnosis.category === "RISK_OR_FRAUD" ? 0.92 : 0.08),
    recommendedAction: action,
    expectedRecoveryProbability: action === "STOP" || action === "HUMAN_REVIEW" ? 0 : score,
    retryAfterMinutes: action === "RETRY_LATER" ? 20 + payment.retryCount * 15 : null,
    confidence: diagnosis.confidence >= 0.75 ? 0.86 : 0.58,
    reasoningSummary: `${diagnosis.explanation} Selected ${action.replaceAll("_", " ").toLowerCase()} using the deterministic fallback model.`
  });
}

export function parseAiDecision(input: unknown): AiDecision {
  return aiDecisionSchema.parse(input);
}
