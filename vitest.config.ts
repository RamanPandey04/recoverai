import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@recoverai/domain": path.resolve(__dirname, "packages/domain/src/index.ts") } },
  test: { environment: "node", setupFiles: ["./tests/setup.ts"], coverage: { reporter: ["text", "html"] } }
});
