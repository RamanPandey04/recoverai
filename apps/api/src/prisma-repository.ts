import { Prisma, PrismaClient } from "@prisma/client";
import {
  aiDecisionSchema, diagnosisSchema, paymentMethodSchema, policyDecisionSchema, simulationProfileSchema,
  failureCategories, paymentStatuses, strategyMetricsSchema, type AuditEvent, type PaymentCase, type StrategyMetrics
} from "@recoverai/domain";
import type { CaseFilters, Repository } from "./repository.js";

const json = (value: unknown) => value as Prisma.InputJsonValue;
type PaymentCaseRow = Prisma.PaymentCaseGetPayload<{ include: { attempts: true; auditEvents: true } }>;
const metadata = (value: Prisma.JsonValue | null): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export class PrismaRepository implements Repository {
  constructor(private prisma = new PrismaClient()) {}

  async replaceBatch(batchId: string, cases: PaymentCase[]) {
    await this.prisma.$transaction(async tx => {
      await tx.batch.upsert({ where: { id: batchId }, update: { seed: cases[0]?.simulationProfile.seed ?? 0 }, create: { id: batchId, seed: cases[0]?.simulationProfile.seed ?? 0, label: "RecoverAI synthetic batch" } });
      const existing = await tx.paymentCase.findMany({ where: { batchId }, select: { id: true } });
      await tx.executionClaim.deleteMany({ where: { caseId: { in: existing.map(item => item.id) } } });
      await tx.paymentCase.deleteMany({ where: { batchId } });
      for (const c of cases) await tx.paymentCase.create({ data: this.toCreate(c) });
    });
  }

  async list(filters: CaseFilters = {}) {
    const status = paymentStatuses.find(value => value === filters.status);
    const failureCategory = failureCategories.find(value => value === filters.category);
    const rows = await this.prisma.paymentCase.findMany({
      where: {
        ...(filters.batchId ? { batchId: filters.batchId } : {}),
        ...(status ? { status } : {}),
        ...(failureCategory ? { failureCategory } : {}),
        ...(filters.search ? { OR: ["customerName", "externalPaymentId", "failureCode"].map(field => ({ [field]: { contains: filters.search, mode: "insensitive" } })) } : {})
      },
      include: { attempts: { orderBy: { createdAt: "asc" } }, auditEvents: { orderBy: { timestamp: "asc" } } },
      orderBy: filters.sort === "amount" ? { amount: "desc" } : filters.sort === "recoverability" ? { recoverabilityScore: "desc" } : { createdAt: "desc" }
    });
    const mapped = rows.map(r => this.fromRow(r));
    return filters.action ? mapped.filter(c => c.aiDecision?.recommendedAction === filters.action) : mapped;
  }

  async get(id: string) {
    const row = await this.prisma.paymentCase.findUnique({
      where: { id },
      include: { attempts: { orderBy: { createdAt: "asc" } }, auditEvents: { orderBy: { timestamp: "asc" } } }
    });
    return row ? this.fromRow(row) : undefined;
  }

  async save(c: PaymentCase) {
    await this.prisma.$transaction(async tx => {
      await tx.batch.upsert({ where: { id: c.batchId }, update: {}, create: { id: c.batchId, seed: c.simulationProfile.seed, label: c.batchId } });
      await tx.paymentCase.upsert({ where: { id: c.id }, create: this.toCreate(c), update: {
        status: c.status, failureCategory: c.failureCategory ?? undefined, retryCount: c.retryCount, contactCount: c.contactCount,
        recoverabilityScore: c.recoverabilityScore, riskScore: c.riskScore, recoveredAmount: c.recoveredAmount,
        nextActionAt: c.nextActionAt, lastContactAt: c.lastContactAt, manuallyStopped: c.manuallyStopped,
        demoTags: json(c.demoTags),
        diagnosis: c.diagnosis ? json(c.diagnosis) : undefined, aiDecision: c.aiDecision ? json(c.aiDecision) : undefined,
        policyDecision: c.policyDecision ? json(c.policyDecision) : undefined
      } });
      for (const a of c.attempts) await tx.recoveryAttempt.upsert({ where: { idempotencyKey: a.idempotencyKey }, update: {}, create: { id: a.id, caseId: c.id, action: a.action, mode: a.mode, idempotencyKey: a.idempotencyKey, success: a.success, outcome: a.outcome, createdAt: a.createdAt } });
      for (const a of c.audit) await tx.auditEvent.upsert({ where: { id: a.id }, update: {}, create: { id: a.id, caseId: c.id, eventType: a.eventType, actor: a.actor, reason: a.reason, metadata: a.metadata ? json(a.metadata) : undefined, mode: a.mode, timestamp: a.timestamp } });
    });
  }

  async getBatch(batchId: string) { return this.list({ batchId }); }
  async saveExperiment(batchId: string, metrics: StrategyMetrics) { await this.prisma.experimentRun.upsert({ where: { batchId_strategy: { batchId, strategy: metrics.strategy } }, update: { metrics: json(metrics) }, create: { batchId, strategy: metrics.strategy, metrics: json(metrics) } }); }
  async getExperiments(batchId: string) { const rows = await this.prisma.experimentRun.findMany({ where: { batchId }, orderBy: { createdAt: "desc" } }); return rows.map(row => strategyMetricsSchema.parse(row.metrics)); }
  async clearExperiments(batchId: string) { await this.prisma.experimentRun.deleteMany({ where: { batchId } }); }
  async processWebhook(eventId: string, eventType: string, payloadHash: string, payment: PaymentCase | null) {
    try {
      await this.prisma.$transaction(async tx => {
        await tx.webhookEvent.create({ data: { id: eventId, eventType, payloadHash } });
        if (!payment) return;
        await tx.batch.upsert({ where: { id: payment.batchId }, update: {}, create: { id: payment.batchId, seed: payment.simulationProfile.seed, label: "Razorpay webhook cases" } });
        await tx.paymentCase.upsert({ where: { externalPaymentId: payment.externalPaymentId }, update: {}, create: this.toCreate(payment) });
        for (const event of payment.audit) {
          await tx.auditEvent.upsert({ where: { id: event.id }, update: {}, create: { id: event.id, caseId: payment.id, eventType: event.eventType, actor: event.actor, reason: event.reason, metadata: event.metadata ? json(event.metadata) : undefined, mode: event.mode, timestamp: event.timestamp } });
        }
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async claimExecution(caseId: string, idempotencyKey: string) {
    try {
      await this.prisma.executionClaim.create({ data: { caseId, idempotencyKey } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  private toCreate(c: PaymentCase): Prisma.PaymentCaseUncheckedCreateInput {
    return {
      id: c.id, batchId: c.batchId, externalPaymentId: c.externalPaymentId, customerId: c.customerId, customerName: c.customerName,
      customerEmail: c.customerEmail, amount: c.amount, currency: c.currency, paymentMethod: c.paymentMethod, status: c.status,
      failureCode: c.failureCode, failureReason: c.failureReason, failureCategory: c.failureCategory ?? undefined,
      retryCount: c.retryCount, maxRetries: c.maxRetries, contactCount: c.contactCount, maxContacts: c.maxContacts,
      recoverabilityScore: c.recoverabilityScore, riskScore: c.riskScore, recoveredAmount: c.recoveredAmount,
      nextActionAt: c.nextActionAt, lastContactAt: c.lastContactAt, manuallyStopped: c.manuallyStopped,
      demoTags: json(c.demoTags),
      diagnosis: c.diagnosis ? json(c.diagnosis) : undefined, aiDecision: c.aiDecision ? json(c.aiDecision) : undefined,
      policyDecision: c.policyDecision ? json(c.policyDecision) : undefined, simulationProfile: json(c.simulationProfile), createdAt: c.createdAt
    };
  }

  private fromRow(row: PaymentCaseRow): PaymentCase {
    const actor = (value: string): AuditEvent["actor"] => ["SYSTEM", "AI", "POLICY", "OPERATOR", "RAZORPAY"].includes(value) ? value as AuditEvent["actor"] : "SYSTEM";
    return {
      id: row.id, batchId: row.batchId, externalPaymentId: row.externalPaymentId, customerId: row.customerId,
      customerName: row.customerName, customerEmail: row.customerEmail, amount: row.amount.toNumber(), currency: "INR",
      paymentMethod: paymentMethodSchema.parse(row.paymentMethod), status: row.status, failureCode: row.failureCode, failureReason: row.failureReason,
      failureCategory: row.failureCategory, retryCount: row.retryCount, maxRetries: row.maxRetries, contactCount: row.contactCount,
      maxContacts: row.maxContacts, recoverabilityScore: row.recoverabilityScore, riskScore: row.riskScore,
      recoveredAmount: row.recoveredAmount.toNumber(), nextActionAt: row.nextActionAt?.toISOString() ?? null,
      lastContactAt: row.lastContactAt?.toISOString() ?? null, manuallyStopped: row.manuallyStopped,
      demoTags: Array.isArray(row.demoTags) ? row.demoTags.filter((tag): tag is string => typeof tag === "string") : [],
      diagnosis: row.diagnosis ? diagnosisSchema.parse(row.diagnosis) : undefined,
      aiDecision: row.aiDecision ? aiDecisionSchema.parse(row.aiDecision) : undefined,
      policyDecision: row.policyDecision ? policyDecisionSchema.parse(row.policyDecision) : undefined,
      simulationProfile: simulationProfileSchema.parse(row.simulationProfile),
      attempts: row.attempts.map(a => ({ id: a.id, action: a.action, mode: a.mode, idempotencyKey: a.idempotencyKey, success: a.success, outcome: a.outcome, createdAt: a.createdAt.toISOString() })),
      audit: row.auditEvents.map(a => ({ id: a.id, caseId: a.caseId, eventType: a.eventType, actor: actor(a.actor), reason: a.reason, metadata: metadata(a.metadata), mode: a.mode === "RAZORPAY_TEST" ? "RAZORPAY_TEST" : "SIMULATION", timestamp: a.timestamp.toISOString() })),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
