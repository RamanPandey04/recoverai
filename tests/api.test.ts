import { createHmac } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import { MemoryRepository } from "../apps/api/src/repository.js";
import vercelHandler from "../apps/api/src/vercel.js";

const payload={event:"payment.failed",payload:{payment:{entity:{id:"pay_webhook_1",amount:499900,currency:"INR",method:"upi",error_code:"BANK_TEMPORARILY_UNAVAILABLE",error_description:"Issuer unavailable",created_at:1710000000}}}};
describe("Razorpay webhook",()=>{
  it("rejects an invalid signature",async()=>{await request(createApp()).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature","bad").send(JSON.stringify(payload)).expect(401)});
  it("processes a valid event idempotently",async()=>{const repo=new MemoryRepository();const app=createApp(repo);const raw=JSON.stringify(payload);const signature=createHmac("sha256","test_webhook_secret").update(raw).digest("hex");const first=await request(app).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).set("x-razorpay-event-id","evt_1").send(raw);expect(first.status).toBe(202);const second=await request(app).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).set("x-razorpay-event-id","evt_1").send(raw);expect(second.body.duplicate).toBe(true);expect((await repo.list()).length).toBe(1)});
  it("does not reset case state when a new event references the same payment",async()=>{const repo=new MemoryRepository();const app=createApp(repo);const raw=JSON.stringify(payload);const signature=createHmac("sha256","test_webhook_secret").update(raw).digest("hex");await request(app).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).set("x-razorpay-event-id","evt_first").send(raw).expect(202);const payment=(await repo.list())[0]!;payment.status="RECOVERED";payment.recoveredAmount=payment.amount;await repo.save(payment);await request(app).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).set("x-razorpay-event-id","evt_second").send(raw).expect(202);expect((await repo.get(payment.id))).toMatchObject({status:"RECOVERED",recoveredAmount:4999})});
  it("converts paise to rupees without rounding away sub-rupee value",async()=>{const repo=new MemoryRepository();const app=createApp(repo);const fractional=structuredClone(payload);fractional.payload.payment.entity.id="pay_fractional";fractional.payload.payment.entity.amount=499950;const raw=JSON.stringify(fractional);const signature=createHmac("sha256","test_webhook_secret").update(raw).digest("hex");await request(app).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).send(raw).expect(202);expect((await repo.list())[0]?.amount).toBe(4999.5)});
  it("rejects a signed but malformed payment.failed payload",async()=>{const raw=JSON.stringify({event:"payment.failed",payload:{}});const signature=createHmac("sha256","test_webhook_secret").update(raw).digest("hex");await request(createApp()).post("/api/webhooks/razorpay").set("content-type","application/json").set("x-razorpay-signature",signature).send(raw).expect(400)});
});

describe("batch API",()=>{
  it("resets experiment results and reproduces seed 2026",async()=>{const app=createApp();await request(app).post("/api/batches/generate").send({count:100,seed:2026}).expect(201);const first=await request(app).post("/api/batches/batch-2026/run-recoverai").send({}).expect(200);await request(app).post("/api/batches/generate").send({count:100,seed:2026}).expect(201);const cleared=await request(app).get("/api/batches/batch-2026/comparison").expect(200);expect(cleared.body.data.recoverai).toBeUndefined();const second=await request(app).post("/api/batches/batch-2026/run-recoverai").send({}).expect(200);expect(second.body.data).toEqual(first.body.data)});
  it("rejects invalid case filters",async()=>{await request(createApp()).get("/api/cases?status=CHARGED").expect(400)});
});

describe("Vercel serverless handler",()=>{
  it("boots memory mode with the deterministic demo batch",async()=>{
    const response=await request(vercelHandler).get("/api/cases?batchId=batch-2026").expect(200);
    expect(response.body.data).toHaveLength(100);
  });
});
