import { describe, expect, it } from "vitest";
import { createExperimentPopulation, generateSyntheticCases, runBaseline, runRecoverAi, simulateOutcome } from "@recoverai/domain";
import { calculateAnalytics } from "../apps/api/src/analytics.js";

describe("seeded evaluation",()=>{
  it("is reproducible for both strategies",()=>{const first=generateSyntheticCases(100,2026);const second=generateSyntheticCases(100,2026);expect(runRecoverAi(first)).toEqual(runRecoverAi(second));expect(runBaseline(first)).toEqual(runBaseline(second))});
  it("does not mutate the shared payment population",()=>{const cases=generateSyntheticCases(100,2026);const before=structuredClone(cases);runBaseline(cases);runRecoverAi(cases);expect(cases).toEqual(before)});
  it("restores initial conditions after operational state changes",()=>{const cases=generateSyntheticCases(100,2026);const expected=runRecoverAi(cases);cases[0]!.status="RECOVERED";cases[0]!.recoveredAmount=cases[0]!.amount;cases[0]!.retryCount=99;cases[0]!.contactCount=99;expect(runRecoverAi(cases)).toEqual(expected);expect(createExperimentPopulation(cases)[0]).toMatchObject({status:"FAILED",recoveredAmount:0,retryCount:0,contactCount:0})});
  it("uses a common latent draw instead of strategy-specific luck",()=>{const payment=generateSyntheticCases(1,2026)[0]!;expect(simulateOutcome(payment,"RETRY_LATER",0).draw).toBe(simulateOutcome(payment,"SWITCH_PAYMENT_METHOD",20).draw)});
  it("evaluates baseline and RecoverAI from computed outcomes",()=>{const cases=generateSyntheticCases(100,2026);const base=runBaseline(cases);const ai=runRecoverAi(cases);expect(base.totalCases).toBe(100);expect(ai.riskyActionsPrevented).toBeGreaterThan(0);expect(ai.revenueRecovered).toBeGreaterThan(0)});
  it("calculates analytics from cases",()=>{const cases=generateSyntheticCases(10,4);cases[0]!.status="RECOVERED";cases[0]!.recoveredAmount=cases[0]!.amount;const a=calculateAnalytics(cases);expect(a.totalRecoveredRevenue).toBe(cases[0]!.amount);expect(a.recoveryPercentageByCount).toBe(.1)});
  it("contains stable golden success and guardrail cases",()=>{const cases=generateSyntheticCases(100,2026);const success=cases.find(c=>c.demoTags.includes("GOLDEN_SUCCESS"))!;const guardrail=cases.find(c=>c.demoTags.includes("GOLDEN_GUARDRAIL"))!;expect(success).toMatchObject({id:"golden-success-2026",amount:4999,failureCode:"BANK_TEMPORARILY_UNAVAILABLE"});expect(simulateOutcome(success,"RETRY_LATER",20).success).toBe(true);expect(guardrail).toMatchObject({id:"golden-guardrail-2026",retryCount:3,maxRetries:3})});
});
