# Neural API Mesh

> A high-throughput, fault-tolerant API gateway and service mesh engineered for AI/ML workloads. Built with Node.js and PostgreSQL.

![Status](https://img.shields.io/badge/status-production-brightgreen)
![Stack](https://img.shields.io/badge/stack-Node.js%20%2F%20Express%20%2F%20PostgreSQL%20%2F%20TypeScript-black)
![License](https://img.shields.io/badge/license-private-red)

---

## Overview

Neural API Mesh is a backend infrastructure layer designed to orchestrate requests across multiple AI/ML model endpoints — normalizing inputs, managing rate limits, handling failover between providers, and logging inference results to a persistent store.

Built for teams running multiple models in production (OpenAI, Anthropic, Hugging Face, self-hosted), this mesh abstracts provider complexity behind a single unified API surface. Swap models, add fallback chains, and monitor performance without touching application code.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Framework | Express 5 |
| Language | TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| Auth | JWT (RS256) |
| Logging | Winston + Pino |
| Monitoring | Prometheus + Grafana |
| Deployment | AWS ECS (Fargate) + RDS |
| CI/CD | GitHub Actions |
| Containerization | Docker + Docker Compose |

---

## Architecture

```
Client Request
      │
      ▼
┌─────────────────┐
│   Auth Middleware│  ← JWT validation (RS256)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rate Limiter   │  ← Redis sliding window per API key
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Request Router │  ← Routes to model endpoint by task type
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Model A│ │Model B│  ← Primary / Fallback providers
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│ Response Normalizer│ ← Unified output schema
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Inference Log  │  ← Persisted to PostgreSQL via BullMQ
└─────────────────┘
```

---

## Features

- **Provider agnostic** — single request interface routes to OpenAI, Anthropic, Hugging Face, or any REST-compatible model endpoint
- **Fallback chains** — define ordered provider lists per task; automatically fails over on timeout or error
- **Rate limiting** — per-API-key sliding window via Redis; configurable per plan tier
- **Async inference logging** — all requests/responses queued via BullMQ and written to PostgreSQL without blocking the response path
- **Request normalization** — input schema validated and transformed before dispatch; output schema normalized on return
- **Streaming support** — Server-Sent Events (SSE) passthrough for streaming model responses
- **Health checks** — `/health` and `/ready` endpoints per service; provider liveness polling
- **Metrics** — Prometheus-compatible `/metrics` endpoint; pre-built Grafana dashboard included
- **API key management** — generate, rotate, and revoke keys via admin endpoints

---

## Project Structure

```
/
├── src/
│   ├── server.ts             # Express app entry point
│   ├── config/               # Environment config & provider registry
│   ├── middleware/
│   │   ├── auth.ts           # JWT validation
│   │   ├── rateLimiter.ts    # Redis sliding window
│   │   └── errorHandler.ts   # Centralized error formatting
│   ├── routes/
│   │   ├── inference.ts      # POST /v1/inference — main dispatch route
│   │   ├── keys.ts           # API key CRUD (admin)
│   │   └── health.ts         # GET /health, /ready, /metrics
│   ├── services/
│   │   ├── mesh.ts           # Core routing & fallback logic
│   │   ├── providers/        # Provider adapters (OpenAI, Anthropic, etc.)
│   │   └── logger.ts         # Winston/Pino unified logger
│   ├── workers/
│   │   └── inferenceLog.ts   # BullMQ worker — async DB writes
│   ├── db/
│   │   └── client.ts         # Prisma singleton
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── grafana/
│   └── dashboard.json        # Pre-built inference dashboard
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .env.example
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- PostgreSQL instance
- Redis instance
- Docker (optional, recommended)

### Installation

```bash
git clone https://github.com/mbstuDEV/neural-api-mesh.git
cd neural-api-mesh
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/neural_mesh"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT (RS256 — provide public/private key pair)
JWT_PRIVATE_KEY_PATH="./keys/private.pem"
JWT_PUBLIC_KEY_PATH="./keys/public.pem"

# Provider API Keys
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
HUGGINGFACE_API_KEY=""

# Rate Limiting (requests per minute per key)
RATE_LIMIT_FREE=60
RATE_LIMIT_PRO=600
RATE_LIMIT_ENTERPRISE=6000
```

### Quick Start with Docker

```bash
docker-compose -f docker/docker-compose.yml up
```

This spins up the API server, PostgreSQL, Redis, and Grafana in one command.

### Manual Setup

```bash
# Generate RS256 key pair
mkdir keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Migrate and seed the database
npx prisma migrate dev --name init
npx prisma db seed

# Start the dev server
npm run dev
```

---

## API Reference

### POST `/v1/inference`

Dispatch an inference request to the mesh.

**Headers**
```
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Body**
```json
{
  "task": "chat",
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Explain transformer attention." }
  ],
  "options": {
    "temperature": 0.7,
    "max_tokens": 1024,
    "stream": false
  }
}
```

**Response**
```json
{
  "id": "inf_01j...",
  "model": "gpt-4o",
  "provider": "openai",
  "content": "Transformer attention is...",
  "usage": {
    "prompt_tokens": 18,
    "completion_tokens": 312,
    "total_tokens": 330
  },
  "latency_ms": 843
}
```

### GET `/health`

Returns `200 OK` if the server is alive.

### GET `/ready`

Returns `200 OK` only when all critical dependencies (DB, Redis) are reachable.

### GET `/metrics`

Prometheus-format metrics: request counts, latencies, provider error rates.

---

## Scripts

```bash
npm run dev          # ts-node-dev with hot reload
npm run build        # Compile TypeScript to /dist
npm run start        # Run compiled build
npm run lint         # ESLint
npm run test         # Jest unit tests
npm run test:e2e     # Supertest integration tests
npm run migrate      # Run Prisma migrations
npm run seed         # Seed the database
```

---

## Deployment

The GitHub Actions pipeline lints, tests, builds a Docker image, pushes to AWS ECR, and deploys to ECS Fargate on every merge to `main`. Zero-downtime rolling updates are managed by ECS.

See `.github/workflows/deploy.yml` for full configuration.

---

## Security

- All routes require a valid JWT (RS256) — asymmetric keys, no shared secrets
- API keys are hashed (SHA-256) before storage — raw keys are shown once on creation only
- Provider credentials are loaded from environment at boot — never logged or returned in responses
- All inputs validated via Zod schemas before dispatch
- Rate limiting enforced at the middleware layer before any provider call

---

## License

Private. All rights reserved. © 2026 muntasirbergam.studio
