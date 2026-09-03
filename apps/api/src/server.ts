import { createApp } from "./app.js";
import { config } from "./config.js";
import { generateSyntheticCases } from "@recoverai/domain";
import { MemoryRepository } from "./repository.js";
import { PrismaRepository } from "./prisma-repository.js";
import { audit } from "./audit.js";

const repo = config.PERSISTENCE_MODE === "POSTGRES" ? new PrismaRepository() : new MemoryRepository();
if (config.PERSISTENCE_MODE === "MEMORY") {
  const initial = generateSyntheticCases(100, 2026, "batch-2026");
  for (const payment of initial) {
    audit(payment, "PAYMENT_FAILURE_RECEIVED", "SYSTEM", "Synthetic demo failure loaded.", { seed: 2026 });
    audit(payment, "CASE_CREATED", "SYSTEM", "Recovery case created in simulation mode.");
  }
  await repo.replaceBatch("batch-2026", initial);
}
const app = createApp(repo);
app.listen(config.PORT, () => {
  console.log(JSON.stringify({ level: "info", service: "recoverai-api", port: config.PORT, mode: config.EXECUTION_MODE }));
});
