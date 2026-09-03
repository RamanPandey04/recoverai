import type { Diagnosis, FailureCategory, PaymentCase } from "./types.js";

type Rule = { category: FailureCategory; transient: boolean; customerActionRequired: boolean; safeToRetry: boolean; confidence: number; explanation: string };

const rules: Record<string, Rule> = {
  BANK_TEMPORARILY_UNAVAILABLE: { category: "TRANSIENT_TECHNICAL", transient: true, customerActionRequired: false, safeToRetry: true, confidence: 0.96, explanation: "Issuer is temporarily unavailable; a delayed retry is normally safe." },
  NETWORK_ERROR: { category: "TRANSIENT_TECHNICAL", transient: true, customerActionRequired: false, safeToRetry: true, confidence: 0.94, explanation: "The payment failed during a transient network exchange." },
  UPI_SERVER_ERROR: { category: "TRANSIENT_TECHNICAL", transient: true, customerActionRequired: false, safeToRetry: true, confidence: 0.93, explanation: "The UPI rail returned a temporary service error." },
  INSUFFICIENT_FUNDS: { category: "INSUFFICIENT_FUNDS", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.99, explanation: "The account balance was insufficient; customer action is required before another attempt." },
  BAD_AUTHENTICATION: { category: "AUTHENTICATION", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.97, explanation: "Authentication was not completed successfully." },
  CARD_EXPIRED: { category: "PAYMENT_METHOD_ISSUE", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.99, explanation: "The payment instrument is expired; a different method is required." },
  CARD_DECLINED: { category: "PAYMENT_METHOD_ISSUE", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.89, explanation: "The issuer declined the card; switching methods is safer than blind retrying." },
  PAYMENT_CANCELLED: { category: "CUSTOMER_ACTION_REQUIRED", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.92, explanation: "The customer cancelled or abandoned the payment flow." },
  ACCOUNT_CLOSED: { category: "PERMANENT_FAILURE", transient: false, customerActionRequired: true, safeToRetry: false, confidence: 0.99, explanation: "The funding account is closed and cannot be retried." },
  SUSPECTED_FRAUD: { category: "RISK_OR_FRAUD", transient: false, customerActionRequired: false, safeToRetry: false, confidence: 0.99, explanation: "Risk indicators require human review; automated recovery is unsafe." }
};

export function diagnoseFailure(payment: Pick<PaymentCase, "failureCode" | "failureReason" | "paymentMethod" | "retryCount">): Diagnosis {
  const exact = rules[payment.failureCode.toUpperCase()];
  if (exact) return { ...exact };
  const text = `${payment.failureCode} ${payment.failureReason}`.toLowerCase();
  if (/fraud|risk|stolen|suspicious/.test(text)) return { ...rules.SUSPECTED_FRAUD!, confidence: 0.82 };
  if (/timeout|network|temporar|unavailable/.test(text)) return { ...rules.NETWORK_ERROR!, confidence: 0.78 };
  return { category: "UNKNOWN", transient: false, customerActionRequired: false, safeToRetry: false, confidence: 0.45, explanation: "No trusted deterministic mapping exists for this failure; human review is safest." };
}
