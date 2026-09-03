import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { createHash } from "node:crypto";
import { z } from "zod";
import { addMoney, authorizeManualAction, createExperimentPopulation, failureCategories, generateSyntheticCases, paymentStatuses, runBaseline, runRecoverAi, recoveryActions, sumMoney } from "@recoverai/domain";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { calculateAnalytics } from "./analytics.js";
import { audit } from "./audit.js";
import { MemoryRepository, type Repository } from "./repository.js";
import { RecoveryService } from "./services/recovery-service.js";
import { AiDecisionService } from "./services/ai-service.js";
import { parseFailedPayment, verifyRazorpaySignature } from "./razorpay.js";

const batchSchema = z.object({ count: z.number().int().min(2).max(500).default(100), seed: z.number().int().min(1).max(2_147_483_647).default(2026) }).strict();
const executeSchema = z.object({ action: z.enum(recoveryActions).optional(), idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{6,120}$/).optional() }).strict();
const listCasesSchema = z.object({
  batchId: z.string().min(1).max(100).optional(), status: z.enum(paymentStatuses).optional(), category: z.enum(failureCategories).optional(),
  action: z.enum(recoveryActions).optional(), search: z.string().trim().max(100).optional(), sort: z.enum(["recoverability", "amount"]).optional()
});
const idSchema = z.string().min(1).max(120);

export function createApp(repo: Repository = new MemoryRepository()) {
  const app = express(); const recovery = new RecoveryService(repo); const deterministicRecovery = new RecoveryService(repo, new AiDecisionService(false));
  const activeBatchRuns = new Set<string>();
  app.set("repo", repo);
  app.use(helmet()); app.use(cors({ origin: config.WEB_ORIGIN })); app.use(pinoHttp({ level: config.LOG_LEVEL }));
  app.post("/api/webhooks/razorpay", rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 10_000 : 1_200, standardHeaders: true, legacyHeaders: false }), express.raw({ type: "application/json", limit: "256kb" }), async (req, res, next) => {
    try {
      const raw = req.body as Buffer;
      if (!verifyRazorpaySignature(raw, req.header("x-razorpay-signature"), config.RAZORPAY_WEBHOOK_SECRET)) throw new AppError(401, "Invalid webhook signature", "INVALID_SIGNATURE");
      let payload: unknown;
      try { payload = JSON.parse(raw.toString("utf8")); } catch { throw new AppError(400, "Webhook body is not valid JSON", "INVALID_WEBHOOK_PAYLOAD"); }
      if (!payload || typeof payload !== "object") throw new AppError(400, "Webhook payload must be an object", "INVALID_WEBHOOK_PAYLOAD");
      const eventType = "event" in payload && typeof payload.event === "string" ? payload.event.slice(0, 120) : "unknown";
      const payloadHash = createHash("sha256").update(raw).digest("hex");
      const eventIdHeader = req.header("x-razorpay-event-id");
      const eventId = eventIdHeader && eventIdHeader.length <= 120 ? eventIdHeader : `sha256:${payloadHash}`;
      const payment = parseFailedPayment(payload);
      if (eventType === "payment.failed" && !payment) throw new AppError(400, "payment.failed payload does not match the accepted schema", "INVALID_WEBHOOK_PAYLOAD");
      if (payment) {
        audit(payment, "PAYMENT_FAILURE_RECEIVED", "RAZORPAY", "Verified Razorpay Test Mode payment.failed webhook received.", { payloadHash }, "RAZORPAY_TEST");
        audit(payment, "CASE_CREATED", "SYSTEM", "Payment recovery case created from a verified test webhook.", undefined, "RAZORPAY_TEST");
      }
      const processed = await repo.processWebhook(eventId, eventType, payloadHash, payment);
      if (!processed) return res.status(200).json({ received: true, duplicate: true });
      return res.status(202).json({ received: true, duplicate: false, caseId: payment?.id ?? null });
    } catch (error) { next(error); }
  });
  app.use("/api", rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 10_000 : 300, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "recoverai-api", mode: config.EXECUTION_MODE, ai: config.OPENAI_API_KEY ? "OPENAI_WITH_FALLBACK" : "DETERMINISTIC_FALLBACK" }));
  app.get("/api/cases", async (req, res, next) => { try { res.json({ data: await repo.list(listCasesSchema.parse(req.query)) }); } catch (e) { next(e); } });
  app.get("/api/cases/:id", async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const item = await repo.get(id); if (!item) throw new AppError(404, "Payment case not found", "CASE_NOT_FOUND"); res.json({ data: item }); } catch (e) { next(e); } });
  app.get("/api/cases/:id/audit", async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const item = await repo.get(id); if (!item) throw new AppError(404, "Payment case not found", "CASE_NOT_FOUND"); res.json({ data: item.audit }); } catch (e) { next(e); } });
  app.post("/api/cases/:id/diagnose", async (req, res, next) => { try { res.json({ data: await recovery.diagnose(idSchema.parse(req.params.id)) }); } catch (e) { next(e); } });
  app.post("/api/cases/:id/plan", async (req, res, next) => { try { res.json({ data: await recovery.plan(idSchema.parse(req.params.id)) }); } catch (e) { next(e); } });
  app.post("/api/cases/:id/execute", async (req, res, next) => { try { const body = executeSchema.parse(req.body); res.json({ data: await recovery.execute(idSchema.parse(req.params.id), body.action, body.idempotencyKey) }); } catch (e) { next(e); } });
  app.post("/api/batches/generate", async (req, res, next) => { try { const input = batchSchema.parse(req.body); const id = `batch-${input.seed}`; if (activeBatchRuns.has(id)) throw new AppError(409, "A run is active for this batch", "BATCH_RUN_IN_PROGRESS"); activeBatchRuns.add(id); try { const cases = generateSyntheticCases(input.count, input.seed, id); for (const c of cases) { audit(c, "PAYMENT_FAILURE_RECEIVED", "SYSTEM", "Synthetic payment failure loaded for reproducible demo.", { seed: input.seed }); audit(c, "CASE_CREATED", "SYSTEM", "Synthetic recovery case created."); } await repo.replaceBatch(id, cases); await repo.clearExperiments(id); res.status(201).json({ data: { id, count: cases.length, seed: input.seed, goldenCaseIds: { success: `golden-success-${input.seed}`, guardrail: `golden-guardrail-${input.seed}` } } }); } finally { activeBatchRuns.delete(id); } } catch (e) { next(e); } });
  app.post("/api/batches/:id/run-baseline", async (req, res, next) => { try { const id = idSchema.parse(req.params.id); if (activeBatchRuns.has(id)) throw new AppError(409, "A run is already active for this batch", "BATCH_RUN_IN_PROGRESS"); activeBatchRuns.add(id); try { const cases = await repo.getBatch(id); if (!cases.length) throw new AppError(404, "Batch not found", "BATCH_NOT_FOUND"); const metrics = runBaseline(createExperimentPopulation(cases)); await repo.saveExperiment(id, metrics); res.json({ data: metrics }); } finally { activeBatchRuns.delete(id); } } catch (e) { next(e); } });
  app.post("/api/batches/:id/run-recoverai", async (req, res, next) => { try {
    const id = idSchema.parse(req.params.id); const current = await repo.getBatch(id); if (!current.length) throw new AppError(404, "Batch not found", "BATCH_NOT_FOUND");
    if (activeBatchRuns.has(id)) throw new AppError(409, "A run is already active for this batch", "BATCH_RUN_IN_PROGRESS");
    activeBatchRuns.add(id);
    try {
      const population = createExperimentPopulation(current);
      for (const c of population) { audit(c, "PAYMENT_FAILURE_RECEIVED", "SYSTEM", "Synthetic payment failure loaded for reproducible demo.", { seed: c.simulationProfile.seed }); audit(c, "CASE_CREATED", "SYSTEM", "Synthetic recovery case created."); }
      await repo.replaceBatch(id, population);
      for (const item of population) { await deterministicRecovery.plan(item.id); await deterministicRecovery.execute(item.id); }
      const updated = await repo.getBatch(id); const metrics = runRecoverAi(population);
      const actualRecovered = sumMoney(updated.map(item => item.recoveredAmount));
      const actualRecoveredCount = updated.filter(item => item.status === "RECOVERED").length;
      if (actualRecovered !== metrics.revenueRecovered || actualRecoveredCount !== metrics.recoveredCount) throw new AppError(500, "Materialized run diverged from deterministic evaluation", "EVALUATION_INVARIANT_FAILED");
      await repo.saveExperiment(id, metrics); res.json({ data: metrics });
    } finally { activeBatchRuns.delete(id); }
  } catch (e) { next(e); } });
  app.get("/api/batches/:id/comparison", async (req, res, next) => { try { const runs = await repo.getExperiments(idSchema.parse(req.params.id)); const baseline = runs.find(r => r.strategy === "BASELINE"); const recoverai = runs.find(r => r.strategy === "RECOVERAI"); res.json({ data: { baseline, recoverai, additionalRevenue: addMoney(recoverai?.revenueRecovered ?? 0, -(baseline?.revenueRecovered ?? 0)), attemptsReduced: (baseline?.attempts ?? 0) - (recoverai?.attempts ?? 0) } }); } catch (e) { next(e); } });
  app.get("/api/analytics/summary", async (req, res, next) => { try { const batchId = z.string().min(1).max(100).default("batch-2026").parse(req.query.batchId); const cases = await repo.list({ batchId }); res.json({ data: calculateAnalytics(cases, await repo.getExperiments(batchId)) }); } catch (e) { next(e); } });
  app.get("/api/escalations", async (_req, res, next) => { try { res.json({ data: await repo.list({ status: "ESCALATED" }) }); } catch (e) { next(e); } });
  app.post("/api/escalations/:id/resolve", async (req, res, next) => { try {
    const schema = z.object({ resolution: z.enum(["APPROVE_SAFE_ACTION", "STOP_RECOVERY", "MARK_REVIEWED"]), action: z.enum(recoveryActions).optional() }).strict();
    const body = schema.parse(req.body); const id = idSchema.parse(req.params.id); const payment = await repo.get(id);
    if (!payment) throw new AppError(404, "Case not found", "CASE_NOT_FOUND");
    if (payment.status !== "ESCALATED") throw new AppError(409, "Only escalated cases can be resolved", "INVALID_CASE_STATE");
    if (body.resolution === "STOP_RECOVERY" || body.resolution === "MARK_REVIEWED") {
      payment.status = "STOPPED"; payment.manuallyStopped = true;
      audit(payment, body.resolution === "STOP_RECOVERY" ? "CASE_STOPPED" : "CASE_REVIEWED", "OPERATOR", body.resolution === "STOP_RECOVERY" ? "Operator stopped recovery during human review." : "Operator completed review without authorizing an automated action.");
    } else {
      if (!body.action || ["HUMAN_REVIEW", "STOP"].includes(body.action)) throw new AppError(400, "A safe executable action is required", "SAFE_ACTION_REQUIRED");
      if (!payment.diagnosis) throw new AppError(409, "Case must be diagnosed before review resolution", "DIAGNOSIS_REQUIRED");
      const authorization = authorizeManualAction(payment, payment.diagnosis, body.action);
      if (!authorization.approved) throw new AppError(409, authorization.reason, authorization.rule);
      payment.policyDecision = authorization;
      payment.status = "RECOVERY_PLANNED";
      audit(payment, "CASE_REVIEWED", "OPERATOR", "Operator authorized a bounded recovery action after manual review.", { finalAction: body.action });
    }
    await repo.save(payment); res.json({ data: payment });
  } catch (e) { next(e); } });
  app.use((_req, _res, next) => next(new AppError(404, "Route not found", "NOT_FOUND")));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { const appError = error instanceof AppError ? error : error instanceof z.ZodError ? new AppError(400, "Invalid request", "VALIDATION_ERROR", error.flatten()) : error instanceof SyntaxError ? new AppError(400, "Malformed JSON body", "MALFORMED_JSON") : new AppError(500, "Internal server error"); res.status(appError.status).json({ error: { code: appError.code, message: appError.message, details: appError.details } }); });
  return app;
}
