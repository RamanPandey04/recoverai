import type { Express, Request, Response } from "express";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { ensureDemoBatch } from "./demo.js";
import { MemoryRepository, type Repository } from "./repository.js";
import { PrismaRepository } from "./prisma-repository.js";

let appPromise: Promise<Express> | undefined;

async function createRepository(): Promise<Repository> {
  const repo = config.PERSISTENCE_MODE === "POSTGRES" ? new PrismaRepository() : new MemoryRepository();
  if (config.PERSISTENCE_MODE === "MEMORY") await ensureDemoBatch(repo);
  return repo;
}

async function getApp() {
  appPromise ??= createRepository().then(repo => createApp(repo));
  return appPromise;
}

export default async function handler(req: Request, res: Response) {
  const app = await getApp();
  return app(req, res);
}
