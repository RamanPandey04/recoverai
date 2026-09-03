import { diagnoseFailure } from "./diagnosis.js";
import { seededPick, seededUnit } from "./random.js";
import type { FailureCategory, PaymentCase, PaymentMethod, RecoveryAction } from "./types.js";

const failures: Array<{ code: string; reason: string; category: FailureCategory; action: RecoveryAction; risk?: number }> = [
  { code: "BANK_TEMPORARILY_UNAVAILABLE", reason: "Issuer bank temporarily unavailable", category: "TRANSIENT_TECHNICAL", action: "RETRY_LATER" },
  { code: "NETWORK_ERROR", reason: "Network timed out while authorizing payment", category: "TRANSIENT_TECHNICAL", action: "RETRY_LATER" },
  { code: "UPI_SERVER_ERROR", reason: "UPI provider returned a temporary error", category: "TRANSIENT_TECHNICAL", action: "RETRY_LATER" },
  { code: "INSUFFICIENT_FUNDS", reason: "Account has insufficient balance", category: "INSUFFICIENT_FUNDS", action: "SEND_REMINDER" },
  { code: "BAD_AUTHENTICATION", reason: "OTP or 3DS authentication failed", category: "AUTHENTICATION", action: "SEND_REMINDER" },
  { code: "CARD_EXPIRED", reason: "Card is past its expiry date", category: "PAYMENT_METHOD_ISSUE", action: "SWITCH_PAYMENT_METHOD" },
  { code: "CARD_DECLINED", reason: "Issuer declined this card", category: "PAYMENT_METHOD_ISSUE", action: "SWITCH_PAYMENT_METHOD" },
  { code: "PAYMENT_CANCELLED", reason: "Customer left the payment flow", category: "CUSTOMER_ACTION_REQUIRED", action: "SEND_REMINDER" },
  { code: "ACCOUNT_CLOSED", reason: "Funding account is closed", category: "PERMANENT_FAILURE", action: "STOP" },
  { code: "SUSPECTED_FRAUD", reason: "Velocity and device signals indicate suspicious activity", category: "RISK_OR_FRAUD", action: "HUMAN_REVIEW", risk: 0.94 },
  { code: "GATEWAY_X91", reason: "Unmapped processor response X91", category: "UNKNOWN", action: "HUMAN_REVIEW" }
];

const firstNames = ["Aarav", "Ananya", "Diya", "Ishaan", "Kabir", "Meera", "Neha", "Rahul", "Riya", "Vikram", "Zoya", "Aditya"];
const lastNames = ["Shah", "Nair", "Mehta", "Gupta", "Iyer", "Kapoor", "Rao", "Singh", "Joshi", "Bose"];
const methods: PaymentMethod[] = ["UPI", "CARD", "NETBANKING", "WALLET"];
const amounts = [499, 799, 999, 1299, 1999, 2499, 4999, 7999, 9999, 14999, 24999];

export function generateSyntheticCases(count = 100, seed = 2026, batchId = `batch-${seed}`): PaymentCase[] {
  return Array.from({ length: count }, (_, index) => {
    const key = `${seed}-${index}`;
    const goldenSuccess = index === 0;
    const goldenGuardrail = index === 1;
    const failure = goldenSuccess || goldenGuardrail ? failures[0]! : failures[index % failures.length]!;
    const first = seededPick(firstNames, `${key}-first`);
    const last = seededPick(lastNames, `${key}-last`);
    const created = new Date(Date.UTC(2026, 7, 25 + (index % 7), 8 + (index % 10), (index * 7) % 60));
    const method = failure.code === "UPI_SERVER_ERROR" ? "UPI" : seededPick(methods, `${key}-method`);
    const retryCount = goldenSuccess ? 0 : goldenGuardrail ? 3 : Math.floor(seededUnit(`${key}-retry`) * 3);
    const contactCount = goldenSuccess || goldenGuardrail ? 0 : Math.floor(seededUnit(`${key}-contact`) * 2);
    const caseId = goldenSuccess ? `golden-success-${seed}` : goldenGuardrail ? `golden-guardrail-${seed}` : `case-${seed}-${String(index + 1).padStart(3, "0")}`;
    const payment: PaymentCase = {
      id: caseId,
      batchId,
      externalPaymentId: `pay_demo_${seed}_${String(index + 1).padStart(3, "0")}`,
      customerId: `cust_${seed}_${String(index + 1).padStart(3, "0")}`,
      customerName: `${first} ${last}`,
      customerEmail: `${first.toLowerCase()}.${last.toLowerCase()}${index}@example.test`,
      amount: goldenSuccess ? 4999 : goldenGuardrail ? 7999 : seededPick(amounts, `${key}-amount`),
      currency: "INR",
      paymentMethod: method,
      status: "FAILED",
      failureCode: failure.code,
      failureReason: failure.reason,
      failureCategory: null,
      retryCount,
      maxRetries: 3,
      contactCount,
      maxContacts: 2,
      recoverabilityScore: null,
      riskScore: failure.risk ?? Number((seededUnit(`${key}-risk`) * 0.28).toFixed(2)),
      recoveredAmount: 0,
      nextActionAt: null,
      lastContactAt: null,
      manuallyStopped: false,
      demoTags: goldenSuccess ? ["GOLDEN_SUCCESS"] : goldenGuardrail ? ["GOLDEN_GUARDRAIL"] : [],
      attempts: [],
      audit: [],
      simulationProfile: {
        seed: goldenSuccess ? seed * 1000 + 1 : seed + index,
        customerLoyalty: goldenSuccess ? 0.8 : seededUnit(`${key}-loyalty`),
        expectedAction: failure.action,
        initialRetryCount: retryCount,
        initialContactCount: contactCount,
        evaluationVersion: "v2"
      },
      createdAt: created.toISOString(),
      updatedAt: created.toISOString()
    };
    payment.diagnosis = diagnoseFailure(payment);
    payment.failureCategory = payment.diagnosis.category;
    return payment;
  });
}

export function createExperimentPopulation(cases: PaymentCase[]): PaymentCase[] {
  return cases.map(source => {
    const payment = structuredClone(source);
    payment.status = "FAILED";
    payment.retryCount = payment.simulationProfile.initialRetryCount;
    payment.contactCount = payment.simulationProfile.initialContactCount;
    payment.recoveredAmount = 0;
    payment.recoverabilityScore = null;
    payment.nextActionAt = null;
    payment.lastContactAt = null;
    payment.manuallyStopped = false;
    payment.aiDecision = undefined;
    payment.policyDecision = undefined;
    payment.attempts = [];
    payment.audit = [];
    payment.diagnosis = diagnoseFailure(payment);
    payment.failureCategory = payment.diagnosis.category;
    payment.updatedAt = payment.createdAt;
    return payment;
  });
}
