import { z } from "zod";

export const paymentStatuses = ["FAILED", "RECOVERY_PLANNED", "RECOVERING", "RECOVERED", "ESCALATED", "STOPPED", "ABANDONED"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const failureCategories = ["TRANSIENT_TECHNICAL", "CUSTOMER_ACTION_REQUIRED", "PAYMENT_METHOD_ISSUE", "AUTHENTICATION", "INSUFFICIENT_FUNDS", "PERMANENT_FAILURE", "RISK_OR_FRAUD", "UNKNOWN"] as const;
export type FailureCategory = (typeof failureCategories)[number];

export const recoveryActions = ["RETRY_LATER", "SEND_REMINDER", "SWITCH_PAYMENT_METHOD", "HUMAN_REVIEW", "STOP"] as const;
export type RecoveryAction = (typeof recoveryActions)[number];
export type PaymentMethod = "UPI" | "CARD" | "NETBANKING" | "WALLET";
export const paymentMethodSchema = z.enum(["UPI", "CARD", "NETBANKING", "WALLET"]);

export interface Diagnosis {
  category: FailureCategory;
  transient: boolean;
  customerActionRequired: boolean;
  safeToRetry: boolean;
  confidence: number;
  explanation: string;
}
export const diagnosisSchema = z.object({
  category: z.enum(failureCategories), transient: z.boolean(), customerActionRequired: z.boolean(),
  safeToRetry: z.boolean(), confidence: z.number().min(0).max(1), explanation: z.string()
});

export const aiDecisionSchema = z.object({
  recoverability: z.number().min(0).max(1),
  riskScore: z.number().min(0).max(1),
  recommendedAction: z.enum(recoveryActions),
  expectedRecoveryProbability: z.number().min(0).max(1),
  retryAfterMinutes: z.number().int().min(0).max(10080).nullable(),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().min(8).max(500)
}).strict().superRefine((decision, context) => {
  if (decision.recommendedAction === "RETRY_LATER" && decision.retryAfterMinutes === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryAfterMinutes"], message: "Retry decisions require a delay" });
  if (["STOP", "HUMAN_REVIEW"].includes(decision.recommendedAction) && decision.expectedRecoveryProbability !== 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedRecoveryProbability"], message: "Non-executing actions must have zero execution probability" });
});
export type AiDecision = z.infer<typeof aiDecisionSchema>;

export interface PolicyDecision {
  approved: boolean;
  finalAction: RecoveryAction;
  rule: string;
  reason: string;
}
export const policyDecisionSchema = z.object({
  approved: z.boolean(), finalAction: z.enum(recoveryActions), rule: z.string(), reason: z.string()
});

export interface RecoveryAttempt {
  id: string;
  action: RecoveryAction;
  mode: "SIMULATION" | "RAZORPAY_TEST";
  idempotencyKey: string;
  success: boolean | null;
  outcome: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  eventType: string;
  actor: "SYSTEM" | "AI" | "POLICY" | "OPERATOR" | "RAZORPAY";
  reason: string;
  metadata?: Record<string, unknown>;
  mode: "SIMULATION" | "RAZORPAY_TEST";
  timestamp: string;
}

export interface SimulationProfile {
  seed: number;
  customerLoyalty: number;
  expectedAction: RecoveryAction;
  initialRetryCount: number;
  initialContactCount: number;
  evaluationVersion: "v2";
}
export const simulationProfileSchema = z.object({
  seed: z.number().int(), customerLoyalty: z.number().min(0).max(1), expectedAction: z.enum(recoveryActions),
  initialRetryCount: z.number().int().min(0), initialContactCount: z.number().int().min(0), evaluationVersion: z.literal("v2")
});

export interface PaymentCase {
  id: string;
  batchId: string;
  externalPaymentId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: "INR";
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  failureCode: string;
  failureReason: string;
  failureCategory: FailureCategory | null;
  retryCount: number;
  maxRetries: number;
  contactCount: number;
  maxContacts: number;
  recoverabilityScore: number | null;
  riskScore: number;
  recoveredAmount: number;
  nextActionAt: string | null;
  lastContactAt: string | null;
  manuallyStopped: boolean;
  demoTags: string[];
  diagnosis?: Diagnosis;
  aiDecision?: AiDecision;
  policyDecision?: PolicyDecision;
  attempts: RecoveryAttempt[];
  audit: AuditEvent[];
  simulationProfile: SimulationProfile;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyMetrics {
  strategy: "BASELINE" | "RECOVERAI";
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRateByValue: number;
  recoveredCount: number;
  totalCases: number;
  attempts: number;
  customerContacts: number;
  riskyActionsPrevented: number;
  escalations: number;
  averageAttemptsBeforeRecovery: number;
  actionPerformance: Record<string, { attempts: number; successes: number; revenue: number }>;
}

export const strategyMetricsSchema = z.object({
  strategy: z.enum(["BASELINE", "RECOVERAI"]), revenueAtRisk: z.number().nonnegative(), revenueRecovered: z.number().nonnegative(),
  recoveryRateByValue: z.number().min(0).max(1), recoveredCount: z.number().int().nonnegative(), totalCases: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(), customerContacts: z.number().int().nonnegative(), riskyActionsPrevented: z.number().int().nonnegative(),
  escalations: z.number().int().nonnegative(), averageAttemptsBeforeRecovery: z.number().nonnegative(),
  actionPerformance: z.record(z.object({ attempts: z.number().int().nonnegative(), successes: z.number().int().nonnegative(), revenue: z.number().nonnegative() }))
}).strict();
