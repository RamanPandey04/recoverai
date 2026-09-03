# Five-minute demo script

## 0:00–0:30 — Problem

“Businesses lose revenue when payments fail, but retrying everything is not a recovery strategy. An issuer outage, insufficient funds, an expired card, and suspected fraud need different responses. Blind retries waste attempts and can create risk.”

## 0:30–1:00 — RecoverAI concept

“RecoverAI diagnoses why the payment failed, estimates recoverability, and recommends the next-best intervention. The important distinction is that AI is advisory. A deterministic policy engine has final authority, and every decision is audited.”

## 1:00–2:30 — Live workflow

Open **Command center**. Select **Reset demo**.

“This loads 100 reproducible synthetic failures across cards, UPI, netbanking, transient outages, customer-action failures, permanent errors, and fraud-like signals.”

Run **Naive baseline**, then **RecoverAI**. Return to **Overview**.

“The metrics come from the execution outcomes—nothing is hardcoded. We can see value at risk, simulated value recovered, active cases, escalations, and unsafe actions blocked.”

Open **Golden A · Intelligent recovery** (`golden-success-2026`).

“The deterministic diagnosis identifies issuer unavailability. AI recommends a delayed retry with recoverability and confidence. Policy approves it. The simulator evaluates that intervention using category, delay, method, retry history, and a fixed seed. The complete timeline is recorded.”

## 2:30–3:30 — Guardrail override

Open **Golden B · Guardrail override** (`golden-guardrail-2026`) or select it from **Human review**.

“Here the diagnosed failure is transient, so AI recommends retry. But this case has already reached its retry limit. Policy denies the proposal and forces `HUMAN_REVIEW`. No recovery attempt exists. The UI preserves the AI proposal, final action, and exact override rule.”

## 3:30–4:15 — Baseline comparison

Return to **Command center** and show the completed comparison.

“The baseline retries every eligible payment once. Both strategies see an equivalent seeded batch. RecoverAI can use reminders or method switching where retry is a poor fit, avoid permanent/risky actions, and reduce unnecessary attempts. This panel calculates incremental simulated revenue, recovery lift, contacts, escalations, and unsafe actions prevented.”

Do not read fixed numbers in advance; state the values shown by the run.

## 4:15–4:45 — Architecture and safety

“Razorpay events enter through raw-body HMAC verification and idempotent event processing. Domain code is provider-independent. AI output is strict JSON validated by Zod, with timeouts and a deterministic fallback. The policy gate, executor idempotency, audit trail, and analytics remain normal deterministic software.”

## 4:45–5:00 — Close

“RecoverAI does not just retry failed payments. It understands why revenue was lost, chooses the intervention most likely to recover it, proves value against a naive baseline, and keeps financial authority outside the model. All recoveries shown here are clearly labelled simulations; the path to safe production autonomy is measurable and incremental.”
