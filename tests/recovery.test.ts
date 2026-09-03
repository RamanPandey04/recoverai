import { describe, expect, it } from "vitest";
import { generateSyntheticCases } from "@recoverai/domain";
import { MemoryRepository } from "../apps/api/src/repository.js";
import { RecoveryService } from "../apps/api/src/services/recovery-service.js";
import { AiDecisionService } from "../apps/api/src/services/ai-service.js";

async function setup(id: "golden-success-2026" | "golden-guardrail-2026") {
  const repo = new MemoryRepository();
  const cases = generateSyntheticCases(100, 2026, "batch-2026");
  await repo.replaceBatch("batch-2026", cases);
  return { repo, service: new RecoveryService(repo, new AiDecisionService(false)), payment: cases.find(item => item.id === id)! };
}

describe("recovery execution", () => {
  it("materializes the golden successful recovery with a complete audit trail", async () => {
    const { repo, service, payment } = await setup("golden-success-2026");
    await service.plan(payment.id); await service.execute(payment.id);
    const result = (await repo.get(payment.id))!;
    expect(result).toMatchObject({ status: "RECOVERED", recoveredAmount: 4999 });
    expect(result.audit.map(event => event.eventType)).toEqual(expect.arrayContaining(["FAILURE_DIAGNOSED", "AI_DECISION_CREATED", "POLICY_APPROVED", "RECOVERY_EXECUTION_STARTED", "RECOVERY_EXECUTED", "PAYMENT_RECOVERED"]));
  });
  it("shows an AI retry overridden by the retry-limit guardrail", async () => {
    const { repo, service, payment } = await setup("golden-guardrail-2026");
    await service.plan(payment.id); await service.execute(payment.id);
    const result = (await repo.get(payment.id))!;
    expect(result.aiDecision?.recommendedAction).toBe("RETRY_LATER");
    expect(result.policyDecision).toMatchObject({ approved: false, finalAction: "HUMAN_REVIEW", rule: "MAX_RETRY_LIMIT_REACHED" });
    expect(result.status).toBe("ESCALATED"); expect(result.attempts).toHaveLength(0);
  });
  it("atomically prevents concurrent duplicate execution", async () => {
    const { repo, service, payment } = await setup("golden-success-2026"); await service.plan(payment.id);
    const settled = await Promise.allSettled([service.execute(payment.id, undefined, "same-execution-key"), service.execute(payment.id, undefined, "same-execution-key")]);
    expect(settled.filter(result => result.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect((await repo.get(payment.id))!.attempts).toHaveLength(1);
  });
  it("collapses different client keys for the same logical attempt", async () => {
    const { repo, service, payment } = await setup("golden-success-2026"); await service.plan(payment.id);
    const settled = await Promise.allSettled([service.execute(payment.id, undefined, "client-key-a"), service.execute(payment.id, undefined, "client-key-b")]);
    expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await repo.get(payment.id))!.attempts).toHaveLength(1);
  });
  it("does not replan a terminal recovered case", async () => {
    const { service, payment } = await setup("golden-success-2026"); await service.plan(payment.id); await service.execute(payment.id);
    await expect(service.plan(payment.id)).rejects.toMatchObject({ code: "TERMINAL_CASE" });
  });
});
