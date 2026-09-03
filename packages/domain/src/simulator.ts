import { seededUnit } from "./random.js";
import type { FailureCategory, PaymentCase, RecoveryAction } from "./types.js";

const probabilityMatrix: Record<FailureCategory, Record<RecoveryAction, number>> = {
  TRANSIENT_TECHNICAL: { RETRY_LATER: 0.82, SEND_REMINDER: 0.34, SWITCH_PAYMENT_METHOD: 0.46, HUMAN_REVIEW: 0, STOP: 0 },
  CUSTOMER_ACTION_REQUIRED: { RETRY_LATER: 0.18, SEND_REMINDER: 0.62, SWITCH_PAYMENT_METHOD: 0.54, HUMAN_REVIEW: 0, STOP: 0 },
  PAYMENT_METHOD_ISSUE: { RETRY_LATER: 0.14, SEND_REMINDER: 0.42, SWITCH_PAYMENT_METHOD: 0.76, HUMAN_REVIEW: 0, STOP: 0 },
  AUTHENTICATION: { RETRY_LATER: 0.2, SEND_REMINDER: 0.61, SWITCH_PAYMENT_METHOD: 0.52, HUMAN_REVIEW: 0, STOP: 0 },
  INSUFFICIENT_FUNDS: { RETRY_LATER: 0.1, SEND_REMINDER: 0.52, SWITCH_PAYMENT_METHOD: 0.43, HUMAN_REVIEW: 0, STOP: 0 },
  PERMANENT_FAILURE: { RETRY_LATER: 0.01, SEND_REMINDER: 0.03, SWITCH_PAYMENT_METHOD: 0.06, HUMAN_REVIEW: 0, STOP: 0 },
  RISK_OR_FRAUD: { RETRY_LATER: 0, SEND_REMINDER: 0, SWITCH_PAYMENT_METHOD: 0, HUMAN_REVIEW: 0, STOP: 0 },
  UNKNOWN: { RETRY_LATER: 0.12, SEND_REMINDER: 0.18, SWITCH_PAYMENT_METHOD: 0.22, HUMAN_REVIEW: 0, STOP: 0 }
};

export function actionProbability(payment: PaymentCase, action: RecoveryAction, delayMinutes = 20): number {
  const category = payment.failureCategory ?? "UNKNOWN";
  let p = probabilityMatrix[category][action];
  p += (payment.simulationProfile.customerLoyalty - 0.5) * 0.16;
  p -= payment.retryCount * 0.08;
  if (action === "RETRY_LATER" && category === "TRANSIENT_TECHNICAL") p += Math.min(delayMinutes, 45) / 450;
  if (payment.paymentMethod === "UPI" && category === "TRANSIENT_TECHNICAL") p += 0.04;
  return Math.max(0, Math.min(0.95, p));
}

export function simulateOutcome(payment: PaymentCase, action: RecoveryAction, delayMinutes = 20) {
  const probability = actionProbability(payment, action, delayMinutes);
  // Common random numbers make the comparison fair: both strategies see the
  // same latent case outcome. Only their action-dependent probability differs.
  const draw = seededUnit(`${payment.simulationProfile.seed}:${payment.id}:recovery-outcome-v2`);
  return { success: draw < probability, probability, draw };
}
