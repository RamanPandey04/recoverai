import { describe, expect, it } from "vitest";
import { aiDecisionSchema, diagnoseFailure, fallbackDecision, generateSyntheticCases, parseAiDecision } from "@recoverai/domain";

describe("AI boundary",()=>{
  it("rejects malformed AI output",()=>expect(()=>parseAiDecision({recommendedAction:"CHARGE_AGAIN"})).toThrow());
  it("rejects a retry recommendation without a retry delay",()=>expect(()=>parseAiDecision({recoverability:.8,riskScore:.1,recommendedAction:"RETRY_LATER",expectedRecoveryProbability:.7,retryAfterMinutes:null,confidence:.9,reasoningSummary:"Transient issuer failure."})).toThrow());
  it("produces a validated deterministic fallback",()=>{const p=generateSyntheticCases(1,3)[0]!;const d=diagnoseFailure(p);expect(aiDecisionSchema.safeParse(fallbackDecision(p,d)).success).toBe(true)});
});
