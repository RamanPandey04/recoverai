import { describe, expect, it } from "vitest";
import { authorizeAction, diagnoseFailure, fallbackDecision, generateSyntheticCases } from "@recoverai/domain";

const make = (code = "BANK_TEMPORARILY_UNAVAILABLE") => {
  const item = generateSyntheticCases(1, 99)[0]!; item.failureCode = code; item.failureReason = code; item.diagnosis = diagnoseFailure(item); item.failureCategory = item.diagnosis.category; return item;
};

describe("deterministic policy engine", () => {
  it("stops retrying after maxRetries", () => { const p = make(); p.retryCount = p.maxRetries; const ai = fallbackDecision(p,p.diagnosis!); expect(authorizeAction(p,p.diagnosis!,ai).rule).toBe("MAX_RETRY_LIMIT_REACHED"); });
  it("escalates fraud even if AI proposes retry", () => { const p=make("SUSPECTED_FRAUD"); const ai={...fallbackDecision(p,p.diagnosis!),recommendedAction:"RETRY_LATER" as const,riskScore:.95}; const d=authorizeAction(p,p.diagnosis!,ai); expect(d).toMatchObject({approved:false,finalAction:"HUMAN_REVIEW",rule:"HIGH_RISK"}); });
  it("prevents execution after recovery", () => { const p=make(); p.status="RECOVERED";p.recoveredAmount=p.amount;const ai=fallbackDecision(p,p.diagnosis!);expect(authorizeAction(p,p.diagnosis!,ai).rule).toBe("ALREADY_RECOVERED"); });
  it("escalates unknown and low-confidence failures", () => { const p=make("UNMAPPED_42");const ai=fallbackDecision(p,p.diagnosis!);expect(authorizeAction(p,p.diagnosis!,ai).finalAction).toBe("HUMAN_REVIEW"); });
  it("blocks an AI retry when the diagnosis is not retry-safe", () => { const p=make("INSUFFICIENT_FUNDS");const ai={...fallbackDecision(p,p.diagnosis!),recommendedAction:"RETRY_LATER" as const,confidence:.9};expect(authorizeAction(p,p.diagnosis!,ai)).toMatchObject({approved:false,rule:"UNSAFE_RETRY_FOR_DIAGNOSIS",finalAction:"HUMAN_REVIEW"}); });
});
