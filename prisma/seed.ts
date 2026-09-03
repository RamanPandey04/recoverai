import { PrismaClient } from "@prisma/client";
import { generateSyntheticCases } from "@recoverai/domain";

const prisma = new PrismaClient();
const batchId = "batch-2026";
const cases = generateSyntheticCases(100, 2026, batchId);

await prisma.$transaction(async (tx) => {
  await tx.batch.upsert({ where: { id: batchId }, update: { seed: 2026, label: "RecoverAI Demo Batch" }, create: { id: batchId, seed: 2026, label: "RecoverAI Demo Batch" } });
  const existing = await tx.paymentCase.findMany({ where: { batchId }, select: { id: true } });
  await tx.executionClaim.deleteMany({ where: { caseId: { in: existing.map(item => item.id) } } });
  await tx.experimentRun.deleteMany({ where: { batchId } });
  await tx.paymentCase.deleteMany({ where: { batchId } });
  for (const payment of cases) {
    await tx.paymentCase.create({
      data: {
        id: payment.id, batchId, externalPaymentId: payment.externalPaymentId, customerId: payment.customerId,
        customerName: payment.customerName, customerEmail: payment.customerEmail, amount: payment.amount,
        paymentMethod: payment.paymentMethod, failureCode: payment.failureCode, failureReason: payment.failureReason,
        failureCategory: payment.failureCategory ?? undefined, retryCount: payment.retryCount, maxRetries: payment.maxRetries,
        contactCount: payment.contactCount, maxContacts: payment.maxContacts, riskScore: payment.riskScore,
        diagnosis: payment.diagnosis as object, simulationProfile: payment.simulationProfile as object,
        demoTags: payment.demoTags, createdAt: payment.createdAt
      }
    });
  }
});

await prisma.$disconnect();
