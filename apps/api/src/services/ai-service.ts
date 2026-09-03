import OpenAI from "openai";
import { aiDecisionSchema, fallbackDecision, type AiDecision, type Diagnosis, type PaymentCase } from "@recoverai/domain";
import { config } from "../config.js";

export class AiDecisionService {
  private client: OpenAI | null;

  constructor(allowExternalAi = true) {
    this.client = allowExternalAi && config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: config.OPENAI_TIMEOUT_MS }) : null;
  }

  async decide(payment: PaymentCase, diagnosis: Diagnosis): Promise<{ decision: AiDecision; source: "OPENAI" | "FALLBACK" }> {
    if (!this.client) return { decision: fallbackDecision(payment, diagnosis), source: "FALLBACK" };
    try {
      const response = await this.client.chat.completions.create({
        model: config.OPENAI_MODEL, temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You advise on payment recovery. Return only JSON matching the supplied fields. Never invent actions outside the allowed enum." },
          { role: "user", content: JSON.stringify({ allowedActions: ["RETRY_LATER", "SEND_REMINDER", "SWITCH_PAYMENT_METHOD", "HUMAN_REVIEW", "STOP"], payment: { amount: payment.amount, paymentMethod: payment.paymentMethod, retryCount: payment.retryCount, maxRetries: payment.maxRetries, riskScore: payment.riskScore }, diagnosis, requiredShape: { recoverability: "0..1", riskScore: "0..1", recommendedAction: "enum", expectedRecoveryProbability: "0..1", retryAfterMinutes: "integer|null", confidence: "0..1", reasoningSummary: "string" } }) }
        ]
      });
      const content = response.choices[0]?.message.content;
      if (!content) throw new Error("Empty AI response");
      return { decision: aiDecisionSchema.parse(JSON.parse(content)), source: "OPENAI" };
    } catch {
      return { decision: fallbackDecision(payment, diagnosis), source: "FALLBACK" };
    }
  }
}
