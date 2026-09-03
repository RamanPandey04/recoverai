import type { PaymentCase, StrategyMetrics } from "@recoverai/domain";

export interface CaseFilters { batchId?: string; status?: string; category?: string; action?: string; search?: string; sort?: "recoverability" | "amount"; }
export interface Repository {
  replaceBatch(batchId: string, cases: PaymentCase[]): Promise<void>;
  list(filters?: CaseFilters): Promise<PaymentCase[]>;
  get(id: string): Promise<PaymentCase | undefined>;
  save(payment: PaymentCase): Promise<void>;
  getBatch(batchId: string): Promise<PaymentCase[]>;
  saveExperiment(batchId: string, metrics: StrategyMetrics): Promise<void>;
  getExperiments(batchId: string): Promise<StrategyMetrics[]>;
  clearExperiments(batchId: string): Promise<void>;
  processWebhook(eventId: string, eventType: string, payloadHash: string, payment: PaymentCase | null): Promise<boolean>;
  claimExecution(caseId: string, idempotencyKey: string): Promise<boolean>;
}

export class MemoryRepository implements Repository {
  private cases = new Map<string, PaymentCase>();
  private experiments = new Map<string, StrategyMetrics[]>();
  private webhooks = new Set<string>();
  private executionClaims = new Map<string, string>();
  async replaceBatch(batchId: string, cases: PaymentCase[]) {
    const replacedIds = new Set<string>();
    for (const [id, c] of this.cases) if (c.batchId === batchId) { this.cases.delete(id); replacedIds.add(id); }
    for (const [key, caseId] of this.executionClaims) if (replacedIds.has(caseId)) this.executionClaims.delete(key);
    for (const c of cases) this.cases.set(c.id, structuredClone(c));
  }
  async list(filters: CaseFilters = {}) {
    let values = [...this.cases.values()];
    if (filters.batchId) values = values.filter(c => c.batchId === filters.batchId);
    if (filters.status) values = values.filter(c => c.status === filters.status);
    if (filters.category) values = values.filter(c => c.failureCategory === filters.category);
    if (filters.action) values = values.filter(c => c.aiDecision?.recommendedAction === filters.action);
    if (filters.search) { const q = filters.search.toLowerCase(); values = values.filter(c => `${c.customerName} ${c.externalPaymentId} ${c.failureCode}`.toLowerCase().includes(q)); }
    if (filters.sort === "recoverability") values.sort((a, b) => (b.recoverabilityScore ?? -1) - (a.recoverabilityScore ?? -1));
    if (filters.sort === "amount") values.sort((a, b) => b.amount - a.amount);
    return structuredClone(values);
  }
  async get(id: string) { const value = this.cases.get(id); return value ? structuredClone(value) : undefined; }
  async save(payment: PaymentCase) { payment.updatedAt = new Date().toISOString(); this.cases.set(payment.id, structuredClone(payment)); }
  async getBatch(batchId: string) { return this.list({ batchId }); }
  async saveExperiment(batchId: string, metrics: StrategyMetrics) { this.experiments.set(batchId, [...(this.experiments.get(batchId) ?? []).filter(x => x.strategy !== metrics.strategy), structuredClone(metrics)]); }
  async getExperiments(batchId: string) { return structuredClone(this.experiments.get(batchId) ?? []); }
  async clearExperiments(batchId: string) { this.experiments.delete(batchId); }
  async processWebhook(eventId: string, _eventType: string, _payloadHash: string, payment: PaymentCase | null) {
    if (this.webhooks.has(eventId)) return false;
    this.webhooks.add(eventId);
    // A later provider event for the same payment must never reset a case that
    // has already been planned, recovered, escalated, or manually stopped.
    if (payment && !this.cases.has(payment.id)) this.cases.set(payment.id, structuredClone(payment));
    return true;
  }
  async claimExecution(_caseId: string, idempotencyKey: string) {
    if (this.executionClaims.has(idempotencyKey)) return false;
    this.executionClaims.set(idempotencyKey, _caseId);
    return true;
  }
}
