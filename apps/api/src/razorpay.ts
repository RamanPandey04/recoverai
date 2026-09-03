import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentCase } from "@recoverai/domain";
import { diagnoseFailure } from "@recoverai/domain";

const failedPaymentWebhookSchema = z.object({
  event: z.literal("payment.failed"),
  payload: z.object({ payment: z.object({ entity: z.object({
    id: z.string().min(1).max(100), amount: z.number().int().positive().max(1_000_000_000_00),
    currency: z.literal("INR"), method: z.enum(["upi", "card", "netbanking", "wallet"]),
    customer_id: z.string().max(100).nullish(), email: z.string().email().max(254).nullish(),
    error_code: z.string().max(120).nullish(), error_description: z.string().max(500).nullish(),
    created_at: z.number().int().positive().nullish(),
    notes: z.record(z.string(), z.unknown()).nullish()
  }).passthrough() }) })
}).passthrough();

function maskEmail(value: string | null | undefined) {
  if (!value) return "redacted@example.test";
  const [local, domain] = value.split("@");
  if (!local || !domain) return "redacted@example.test";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined) {
  if (!signature || !secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseFailedPayment(payload: unknown, batchId = "razorpay-webhooks"): PaymentCase | null {
  const parsed = failedPaymentWebhookSchema.safeParse(payload);
  if (!parsed.success) return null;
  const entity = parsed.data.payload.payment.entity;
  const now = new Date().toISOString();
  const code = String(entity.error_code ?? "UNKNOWN").toUpperCase();
  const providerCreatedAt = entity.created_at ? new Date(entity.created_at * 1000).toISOString() : now;
  const payment: PaymentCase = {
    id: `case-${entity.id}`, batchId, externalPaymentId: entity.id, customerId: entity.customer_id ?? `anonymous-${entity.id}`,
    customerName: typeof entity.notes?.customer_name === "string" ? entity.notes.customer_name.slice(0, 120) : "Razorpay customer",
    customerEmail: maskEmail(entity.email),
    // Razorpay webhook amounts are paise. The domain and UI use rupees.
    amount: entity.amount / 100, currency: "INR", paymentMethod: entity.method.toUpperCase() as PaymentCase["paymentMethod"],
    status: "FAILED", failureCode: code, failureReason: entity.error_description ?? "Payment failed", failureCategory: null,
    retryCount: 0, maxRetries: 3, contactCount: 0, maxContacts: 2, recoverabilityScore: null, riskScore: 0,
    recoveredAmount: 0, nextActionAt: null, lastContactAt: null, manuallyStopped: false, attempts: [], audit: [],
    demoTags: [],
    simulationProfile: { seed: Number(entity.created_at ?? 1), customerLoyalty: 0.5, expectedAction: "HUMAN_REVIEW", initialRetryCount: 0, initialContactCount: 0, evaluationVersion: "v2" },
    createdAt: providerCreatedAt, updatedAt: now
  };
  payment.diagnosis = diagnoseFailure(payment); payment.failureCategory = payment.diagnosis.category;
  return payment;
}
