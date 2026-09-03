# RecoverAI architecture

## System context

```mermaid
flowchart TB
  R[Razorpay Test Mode] -->|signed payment.failed| W[Webhook adapter]
  S[Seeded synthetic generator] --> I[Case ingestion]
  W --> I
  I --> DB[(PostgreSQL / Prisma)]
  DB --> D[Failure diagnosis]
  D --> A[AI decision service]
  A --> P{Deterministic policy engine}
  P -->|approved| X[Recovery executor]
  P -->|override| Q[Human review queue]
  X --> O[Outcome simulator / test adapter]
  O --> DB
  Q --> DB
  DB --> N[Analytics service]
  N --> UI[Next.js operations dashboard]
```

The AI layer proposes. The policy layer authorizes. The executor performs only closed, typed actions. The audit stream records every transition.

## Component boundaries

```mermaid
flowchart LR
  subgraph External integration
    RW[Razorpay webhook verifier]
    OA[OpenAI adapter]
  end
  subgraph Domain
    FD[Failure diagnosis]
    DE[Decision schema]
    PE[Policy engine]
    SE[Seeded simulator]
  end
  subgraph Application
    RS[Recovery service]
    AR[Analytics]
    REPO[Repository interface]
  end
  subgraph Delivery
    API[Express REST]
    WEB[Next.js UI]
  end
  RW --> API --> RS
  RS --> FD --> OA --> DE --> PE --> SE
  RS --> REPO
  AR --> REPO
  WEB --> API
```

Razorpay types do not enter core policy code. OpenAI can be removed without breaking the workflow. Repository implementations can be swapped between the instant in-memory demo and PostgreSQL.

## Core sequence

```mermaid
sequenceDiagram
  participant U as Operator/Event
  participant API
  participant D as Diagnosis
  participant AI
  participant P as Policy
  participant E as Executor
  participant DB
  U->>API: failed payment / run case
  API->>D: normalized context
  D-->>API: typed diagnosis
  API->>AI: minimal decision context
  AI-->>API: schema-validated proposal
  API->>P: case + diagnosis + proposal
  alt authorized
    P-->>API: approved closed action
    API->>E: idempotency key + action
    E-->>DB: attempt + outcome + audit
  else denied
    P-->>API: override rule + safe final action
    API-->>DB: escalation/stop + audit
  end
```

## Data and transactions

`PaymentCase` owns current state while `RecoveryAttempt` and `AuditEvent` retain history. Webhook event creation and case creation share a transaction. `ExecutionClaim.idempotencyKey` is atomically inserted before execution, preventing two workers from performing the same action. Attempt and audit writes are transactional in PostgreSQL. A production executor should additionally use a durable queue, leases for abandoned in-progress work, and provider-side idempotency keys.

## Deployment notes

Run the web and API as separate services. PostgreSQL is private to the API. Terminate TLS at the edge, place the webhook route behind a body-size limit, retain the raw request for HMAC verification, and use a durable queue for scheduled retries. Keep `SIMULATION` as a distinct execution mode in data and UI.
