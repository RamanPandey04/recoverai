CREATE TYPE "PaymentStatus" AS ENUM ('FAILED', 'RECOVERY_PLANNED', 'RECOVERING', 'RECOVERED', 'ESCALATED', 'STOPPED', 'ABANDONED');
CREATE TYPE "FailureCategory" AS ENUM ('TRANSIENT_TECHNICAL', 'CUSTOMER_ACTION_REQUIRED', 'PAYMENT_METHOD_ISSUE', 'AUTHENTICATION', 'INSUFFICIENT_FUNDS', 'PERMANENT_FAILURE', 'RISK_OR_FRAUD', 'UNKNOWN');
CREATE TYPE "RecoveryAction" AS ENUM ('RETRY_LATER', 'SEND_REMINDER', 'SWITCH_PAYMENT_METHOD', 'HUMAN_REVIEW', 'STOP');
CREATE TYPE "ExecutionMode" AS ENUM ('SIMULATION', 'RAZORPAY_TEST');

CREATE TABLE "Batch" (
  "id" TEXT NOT NULL,
  "seed" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentCase" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "externalPaymentId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "paymentMethod" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'FAILED',
  "failureCode" TEXT NOT NULL,
  "failureReason" TEXT NOT NULL,
  "failureCategory" "FailureCategory",
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "contactCount" INTEGER NOT NULL DEFAULT 0,
  "maxContacts" INTEGER NOT NULL DEFAULT 2,
  "recoverabilityScore" DOUBLE PRECISION,
  "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "nextActionAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "manuallyStopped" BOOLEAN NOT NULL DEFAULT false,
  "demoTags" JSONB NOT NULL,
  "diagnosis" JSONB,
  "aiDecision" JSONB,
  "policyDecision" JSONB,
  "simulationProfile" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryAttempt" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "action" "RecoveryAction" NOT NULL,
  "mode" "ExecutionMode" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "success" BOOLEAN,
  "outcome" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "mode" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutionClaim" (
  "idempotencyKey" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutionClaim_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE TABLE "ExperimentRun" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentCase_externalPaymentId_key" ON "PaymentCase"("externalPaymentId");
CREATE INDEX "PaymentCase_batchId_status_idx" ON "PaymentCase"("batchId", "status");
CREATE INDEX "PaymentCase_failureCategory_idx" ON "PaymentCase"("failureCategory");
CREATE UNIQUE INDEX "RecoveryAttempt_idempotencyKey_key" ON "RecoveryAttempt"("idempotencyKey");
CREATE INDEX "AuditEvent_caseId_timestamp_idx" ON "AuditEvent"("caseId", "timestamp");
CREATE INDEX "ExecutionClaim_caseId_idx" ON "ExecutionClaim"("caseId");
CREATE UNIQUE INDEX "ExperimentRun_batchId_strategy_key" ON "ExperimentRun"("batchId", "strategy");

ALTER TABLE "PaymentCase" ADD CONSTRAINT "PaymentCase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PaymentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PaymentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
