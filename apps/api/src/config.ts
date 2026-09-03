import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  PERSISTENCE_MODE: z.enum(["MEMORY", "POSTGRES"]).default("MEMORY"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_TIMEOUT_MS: z.coerce.number().default(8000),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Recovery execution is intentionally simulation-only in this build.
  EXECUTION_MODE: z.literal("SIMULATION").default("SIMULATION"),
  LOG_LEVEL: z.string().default("info")
});

export const config = schema.parse(process.env);
