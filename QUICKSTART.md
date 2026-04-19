# Quick Start Guide

Get the distributed job queue system running in 5 minutes.

## Option 1: Local Development (Recommended for testing)

### Step 1: Start infrastructure
```bash
docker compose -f docker compose.dev.yml up -d
```

Wait for services to be healthy (~10 seconds).

### Step 2: Copy environment variables
```bash
cp .env.example .env
```

### Step 3: Start API service
```bash
pnpm run start:dev
```

### Step 4: Start worker service (new terminal)
```bash
pnpm run start:worker:dev
```

### Step 5: Test it
```bash
# Create a job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "payload": {"to": "test@example.com", "subject": "Hello"},
    "idempotencyKey": "test-1"
  }'

# Copy the job ID from response, then check status
curl http://localhost:3000/jobs/<job-id>
```

Watch the worker terminal - you'll see it process the job!

---

## Option 2: Full Docker (Production-like)

### Step 1: Build and run everything
```bash
docker compose -f infra/docker compose.yml up --build -d
```

This starts:
- PostgreSQL
- Redis
- API service on port 3000
- 2 worker instances

### Step 2: Test it
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook",
    "payload": {"url": "https://example.com"},
    "priority": 10
  }'
```

### Step 3: View logs
```bash
docker compose -f infra/docker compose.yml logs -f worker
```

### Step 4: Scale workers
```bash
docker compose -f infra/docker compose.yml up --scale worker=5 -d
```

---

## Testing Features

### 1. Priority Jobs
```bash
# High priority (processed first)
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "urgent", "payload": {}, "priority": 20}'
```

### 2. Delayed Jobs
```bash
# Executes after 10 seconds
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "scheduled", "payload": {}, "delay": 10000}'
```

### 3. Idempotency
```bash
# Run this twice with same key - returns same job ID
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "test", "payload": {}, "idempotencyKey": "unique-123"}'
```

### 4. Check Job Status
```bash
curl http://localhost:3000/jobs/<job-id>
```

Possible statuses:
- `QUEUED` - Waiting to be processed
- `PROCESSING` - Currently executing
- `COMPLETED` - Successfully finished
- `FAILED` - Failed but will retry
- `DEAD_LETTER` - Failed after max retries

---

## Using the Test Script

```bash
./test-api.sh
```

This automatically tests:
- Job creation
- Status retrieval
- Delayed jobs
- Idempotency

---

## Cleanup

### Local dev
```bash
docker compose -f docker compose.dev.yml down -v
```

### Full Docker
```bash
docker compose -f infra/docker compose.yml down -v
```

The `-v` flag removes volumes (clears all data).

---

## Next Steps

1. **Add custom job types**: Edit `src/worker/processors/job.processor.ts`
2. **Adjust retry settings**: Modify `src/shared/constants.ts`
3. **Scale workers**: `docker compose -f infra/docker compose.yml up --scale worker=N -d`
4. **Monitor**: Check logs with `docker compose -f infra/docker compose.yml logs -f`

See [README.md](README.md) for full documentation.
