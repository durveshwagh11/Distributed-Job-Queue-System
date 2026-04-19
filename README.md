# Distributed Job Queue System

A production-grade distributed job queue system built with **NestJS**, **BullMQ**, **Redis**, and **PostgreSQL**. Designed to reliably process background jobs at scale with retry handling, dead-letter queues, priority scheduling, and horizontal worker scaling.

---

## Why This Exists

Processing tasks synchronously in web servers is a reliability anti-pattern — if the request fails, the work is lost. This system decouples job submission from job execution: the API accepts a job, persists it durably, enqueues it for processing, and returns immediately. Workers pick it up asynchronously and handle retries, failures, and visibility independently.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Client                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ POST /jobs
                            │ GET  /jobs/:id
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    API Service (NestJS)                       │
│   JobsController → JobsService                               │
│     1. Check idempotency key (PostgreSQL unique constraint)  │
│     2. Persist job to PostgreSQL (source of truth)           │
│     3. Push to Redis queue (BullMQ)                          │
│     4. Return job ID to client                               │
└──────────────────┬───────────────────────┬───────────────────┘
                   │                       │
                   ▼                       ▼
        ┌─────────────────┐      ┌──────────────────┐
        │   PostgreSQL    │      │      Redis        │
        │                 │      │                  │
        │  Job metadata   │      │  Main queue      │
        │  Job status     │      │  Dead letter     │
        │  Idempotency    │      │  Job locks       │
        └─────────────────┘      └────────┬─────────┘
                   ▲                      │
                   │                      ▼
                   │         ┌─────────────────────────┐
                   │         │       Worker (N)         │
                   └─────────│  Claim → Execute →       │
                             │  Retry or Complete       │
                             └─────────────────────────┘
```

### Components

| Component | Role |
|-----------|------|
| **API Service** | HTTP interface for job submission and status queries |
| **Worker Service** | Consumes jobs from the queue and executes them |
| **Queue Manager** | BullMQ abstraction — handles retries, DLQ, visibility timeout |
| **Job Repository** | TypeORM layer over PostgreSQL for persistent job state |
| **PostgreSQL** | Source of truth for all job data and idempotency |
| **Redis** | Fast queue backend with atomic operations and TTL support |

---

## Job Lifecycle

```
QUEUED → PROCESSING → COMPLETED
                   ↓
                FAILED → (retry with backoff) → QUEUED
                   ↓
             DEAD_LETTER (after max retries exhausted)
```

---

## Key Features

### Idempotency
Clients send an optional `idempotencyKey` with job creation. If a duplicate request arrives, the existing job is returned instead of creating a new one. Enforced via a unique constraint in PostgreSQL — safe under concurrent requests.

### Exponential Backoff Retries
Failed jobs are re-enqueued with increasing delays, preventing thundering herd on recovering downstream services:
```
Attempt 1: 1s delay
Attempt 2: 2s delay
Attempt 3: 4s delay
Attempt N: baseDelay × 2^N
```

### Dead Letter Queue (DLQ)
Jobs that exceed `maxAttempts` are moved to a separate dead letter queue and marked `DEAD_LETTER` in the database for manual inspection or replay.

### Visibility Timeout (At-Least-Once Delivery)
Workers acquire a Redis lock on a job (60s TTL, renewed every 30s). If a worker crashes mid-execution, the lock expires and the job returns to the queue. This guarantees at-least-once delivery — job handlers should be idempotent.

### Priority Queues
```typescript
enum JobPriority {
  LOW      = 1,
  NORMAL   = 5,
  HIGH     = 10,
  CRITICAL = 20,
}
```

### Delayed Jobs
Pass `delay` in milliseconds when creating a job to schedule it for future execution.

### Horizontal Scaling
Multiple worker instances run concurrently, each independently processing jobs. Scale by adding replicas — Redis serializes queue operations, PostgreSQL holds authoritative state.

### Graceful Shutdown
Workers stop accepting new jobs on `SIGTERM`/`SIGINT` and complete any in-flight work before shutting down.

---

## API

### Create a Job

```http
POST /jobs
Content-Type: application/json
```

**Request body:**
```json
{
  "type": "email",
  "payload": {
    "to": "user@example.com",
    "subject": "Hello",
    "body": "World"
  },
  "idempotencyKey": "unique-key-123",
  "priority": 10,
  "maxAttempts": 5,
  "delay": 5000
}
```

`idempotencyKey`, `priority`, `maxAttempts`, and `delay` are all optional.

**Response `201`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "email",
  "status": "QUEUED",
  "priority": 10,
  "attempts": 0,
  "maxAttempts": 5,
  "createdAt": "2024-01-01T10:30:00Z",
  "updatedAt": "2024-01-01T10:30:00Z"
}
```

### Get Job Status

```http
GET /jobs/:id
```

**Response `200`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "email",
  "status": "COMPLETED",
  "priority": 10,
  "attempts": 1,
  "maxAttempts": 5,
  "createdAt": "2024-01-01T10:30:00Z",
  "updatedAt": "2024-01-01T10:30:05Z",
  "processedAt": "2024-01-01T10:30:02Z",
  "completedAt": "2024-01-01T10:30:05Z"
}
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- pnpm

### Steps

**1. Install dependencies:**
```bash
pnpm install
```

**2. Start PostgreSQL and Redis:**
```bash
docker compose -f docker-compose.dev.yml up -d
```

**3. Configure environment:**
```bash
cp .env.example .env
```

**4. Start the API service:**
```bash
pnpm run start:dev
# Listening on http://localhost:3000
```

**5. Start the worker (separate terminal):**
```bash
pnpm run start:worker:dev
```

**6. Try it out:**
```bash
# Create a job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "payload": { "to": "test@example.com" },
    "idempotencyKey": "test-001"
  }'

# Check job status
curl http://localhost:3000/jobs/<job-id>
```

---

## Production Deployment (Docker)

Builds and runs the full stack — PostgreSQL, Redis, API, and 2 worker replicas:

```bash
docker compose -f infra/docker-compose.yml up --build -d
```

**Scale workers:**
```bash
docker compose -f infra/docker-compose.yml up --scale worker=5 -d
```

**View logs:**
```bash
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml logs -f worker
```

**Verify infrastructure health:**
```bash
# PostgreSQL
docker exec job-queue-postgres pg_isready -U postgres

# Redis
docker exec job-queue-redis redis-cli ping
```

---

## Project Structure

```
distributed-job-queue-system/
├── src/
│   ├── api/                    # HTTP layer
│   │   ├── jobs.controller.ts
│   │   ├── jobs.service.ts
│   │   └── dto/
│   ├── worker/                 # Job execution layer
│   │   ├── worker.module.ts
│   │   ├── worker.service.ts
│   │   └── processors/
│   │       └── job.processor.ts
│   ├── queue/                  # BullMQ abstraction
│   │   ├── queue.module.ts
│   │   └── queue.service.ts
│   ├── database/               # TypeORM + PostgreSQL
│   │   ├── entities/
│   │   │   └── job.entity.ts
│   │   └── repositories/
│   │       └── job.repository.ts
│   ├── shared/                 # Enums, interfaces, constants
│   ├── main.ts                 # API entry point
│   └── worker-main.ts          # Worker entry point
├── infra/
│   ├── docker-compose.yml      # Full production stack
│   └── Dockerfile              # Multi-stage build (api + worker targets)
├── docker-compose.dev.yml      # Local dev (infrastructure only)
└── .env.example
```

---

## Design Decisions

### PostgreSQL + Redis: Why Both?

**PostgreSQL** is the source of truth. It holds durable job state, enforces idempotency via unique constraints, and supports complex queries across status, priority, and time.

**Redis (BullMQ)** is the dispatch layer. It provides fast atomic queue operations, TTL-based locking for visibility timeout, and low-latency job pickup.

**Write order matters:** jobs are written to PostgreSQL first, then enqueued in Redis. This means if Redis goes down after a job is persisted, a reconciliation pass could re-enqueue jobs — a deliberate trade-off for durability over strict consistency.

### At-Least-Once vs. Exactly-Once

This system delivers at-least-once. A job may execute twice if a worker crashes after processing but before acknowledging. Exactly-once would require distributed transactions with significant overhead. The trade-off is simpler, faster implementation — handlers should be written to be idempotent.

### UUID Primary Keys

Jobs use UUID primary keys generated in application code. This avoids a database round-trip per insert and makes IDs safe for sharding and external exposure (no sequential integer leakage).

### JSONB Payloads

Job payloads are stored as JSONB in PostgreSQL. This avoids schema migrations for new job types while keeping payloads indexed and queryable.

---

## Failure Scenarios

| Scenario | Handling |
|----------|----------|
| Worker crashes mid-job | Visibility timeout expires → job returns to queue |
| PostgreSQL unavailable | API returns 500, job not created (fail fast) |
| Redis unavailable | API returns 500 (job not enqueued) |
| Job times out | Worker marks failed, triggers retry logic |
| Max retries exceeded | Job moves to DLQ, status set to `DEAD_LETTER` |
| Duplicate submission | Idempotency key match → returns existing job, no new execution |

---

## Testing

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Coverage
pnpm run test:cov
```

---

## Tech Stack

- **Runtime:** Node.js 20, TypeScript
- **Framework:** NestJS 11
- **Queue:** BullMQ 5
- **Database:** PostgreSQL 16 + TypeORM
- **Cache/Queue backend:** Redis 7 + ioredis
- **Logging:** Pino via nestjs-pino
- **Package manager:** pnpm
