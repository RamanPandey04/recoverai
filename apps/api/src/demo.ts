import { generateSyntheticCases } from "@recoverai/domain";
import { audit } from "./audit.js";
import type { Repository } from "./repository.js";

export async function seedDemoBatch(repo: Repository) {
  const initial = generateSyntheticCases(100, 2026, "batch-2026");
  for (const payment of initial) {
    audit(payment, "PAYMENT_FAILURE_RECEIVED", "SYSTEM", "Synthetic demo failure loaded.", { seed: 2026 });
    audit(payment, "CASE_CREATED", "SYSTEM", "Recovery case created in simulation mode.");
  }
  await repo.replaceBatch("batch-2026", initial);
}

export async function ensureDemoBatch(repo: Repository) {
  if ((await repo.getBatch("batch-2026")).length === 0) await seedDemoBatch(repo);
}
