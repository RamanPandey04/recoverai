import type { AuditEvent, PaymentCase } from "@recoverai/domain";

export function audit(payment: PaymentCase, eventType: string, actor: AuditEvent["actor"], reason: string, metadata?: Record<string, unknown>, mode: AuditEvent["mode"] = "SIMULATION"): AuditEvent {
  const event: AuditEvent = {
    id: `audit-${payment.id}-${payment.audit.length + 1}`,
    caseId: payment.id, eventType, actor, reason, metadata,
    mode, timestamp: new Date().toISOString()
  };
  payment.audit.push(event);
  return event;
}
