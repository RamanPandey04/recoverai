import { createApp } from "./app.js";
import { config } from "./config.js";
import { seedDemoBatch } from "./demo.js";
import { MemoryRepository } from "./repository.js";
import { PrismaRepository } from "./prisma-repository.js";

const repo = config.PERSISTENCE_MODE === "POSTGRES" ? new PrismaRepository() : new MemoryRepository();
if (config.PERSISTENCE_MODE === "MEMORY") await seedDemoBatch(repo);
const app = createApp(repo);
app.listen(config.PORT, () => {
  console.log(JSON.stringify({ level: "info", service: "recoverai-api", port: config.PORT, mode: config.EXECUTION_MODE }));
});
