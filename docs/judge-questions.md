# Judge attack review

## 1. Why use AI here at all?

Known failure codes do not need AI; RecoverAI diagnoses them deterministically. AI is useful after diagnosis when amount, method, timing, history, prior interventions, and merchant objectives make several safe actions plausible. It ranks those interventions and summarizes the rationale. Policy still owns authorization.

## 2. Could deterministic rules solve the whole problem?

They can solve a meaningful subset and are the fallback in this demo. Rules become difficult to maintain when context and merchant-specific tradeoffs grow. The design permits rules and AI to coexist: deterministic mappings handle known facts, AI handles bounded contextual ranking, and policies enforce invariants.

## 3. How do you prevent hallucinated actions?

The model can return only a closed five-action enum inside a Zod-validated JSON object. Invalid output is discarded. The executor accepts only the policy-authorized typed action, never arbitrary text, URLs, tool names, or model-generated code.

## 4. What happens when OpenAI is unavailable or times out?

The adapter has a timeout and falls back to a deterministic schema-valid decision model. The recovery workflow remains available, and the audit metadata records whether the recommendation came from OpenAI or fallback logic.

## 5. Why should we trust the simulation results?

The assumptions are explicit in the probability matrix and tests. A stable hash replaces random calls, both strategies share the same latent case draw, every run restores initial state, and results reproduce for a fixed seed. The numbers demonstrate relative performance under those assumptions, not guaranteed production uplift.

## 6. Is the baseline intentionally weak?

The baseline is the common operational default: one immediate retry for each retry-eligible failure. It still excludes fraud, permanent failures, terminal cases, and exhausted retry limits. RecoverAI wins only by selecting context-appropriate actions and timing under the same population and latent outcomes.

## 7. Can the strategies share mutated state?

No. Initial retry/contact history is stored in the simulation profile. Each evaluator deep-clones and restores the population, and the materialized RecoverAI run replaces the batch with that pristine population before execution. Tests run the strategies in repeated and mutated-state scenarios.

## 8. How do you prevent duplicate charging or duplicate recovery execution?

This build performs no live charge. Before any simulated action, the repository atomically claims a unique idempotency key. PostgreSQL enforces it through `ExecutionClaim`; memory mode uses an atomic in-process claim. A production provider call would also receive the same provider-side idempotency key and be reconciled against webhook state.

## 9. How is webhook authenticity verified?

The API computes HMAC-SHA256 over the exact raw request bytes and compares the expected and supplied 64-character hex signatures with `timingSafeEqual`. Invalid signatures are rejected before JSON parsing or persistence. Valid events are transactionally de-duplicated by Razorpay event ID, with a SHA-256 payload hash fallback.

## 10. Are Razorpay amounts handled correctly?

Webhook amounts arrive in paise and are divided by 100 exactly. PostgreSQL uses a two-decimal `Decimal`, so ₹4,999.50 is not rounded to ₹5,000. Tests cover fractional-rupee conversion. Synthetic data is authored directly in rupees.

## 11. Would retrying a generic Razorpay payment actually work in production?

Not through a universal “retry this failed payment” API. This submission does not claim otherwise. Real execution would use capability-specific flows such as a new checkout/payment link or subscription retry, subject to merchant configuration and customer consent. Those adapters are deliberately represented by simulation here.

## 12. What is real versus simulated?

Signed Razorpay Test Mode `payment.failed` ingestion is implemented. Diagnosis, AI/fallback planning, policies, persistence, audit, and analytics are implemented. Recovery outcomes and customer interventions are deterministic simulations and are labelled as such throughout the UI and documentation.

## 13. How do you avoid annoying customers?

Policies cap contacts, enforce a 24-hour cooldown, stop terminal/permanent cases, and recheck limits immediately before execution. Contact actions and retry actions are tracked separately. A production version would also consume customer preferences, consent, channel delivery status, and merchant-specific quiet hours.

## 14. What happens with fraud risk?

`RISK_OR_FRAUD` diagnosis or risk at/above the threshold forces `HUMAN_REVIEW`. It cannot automatically retry. Even the manual-resolution API refuses to release a fraud-risk case to automatic execution. The override rule and original proposal remain visible in the audit trail.

## 15. How would this scale and where is the incremental value?

At scale, ingestion would write to PostgreSQL and enqueue case IDs to partitioned durable workers. Workers would use leases, atomic state transitions, provider idempotency, rate limits, and reconciliation. RecoverAI's incremental value is intervention selection and prioritization across heterogeneous failures—not merely retry scheduling—while maintaining explicit guardrails, explainability, and measurable comparison against the retry-only default.
