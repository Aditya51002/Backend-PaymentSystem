# Payment Gateway

MERN payment processing system for initiating payments, tracking lifecycle state, handling retries, enforcing idempotency, and processing gateway webhooks.

## Stack

- Node.js 20+
- Express 4
- MongoDB via Mongoose 8
- React 18 + Vite
- Jest + Supertest
- Winston logging

## Setup

```bash
npm install
npm --prefix client install
copy .env.example .env
npm start
```

In a second terminal:

```bash
npm run client:dev
```

The API runs on `http://localhost:5000` by default. The Vite client runs on `http://localhost:5173`.

## Environment

```bash
PORT=5000
MONGODB_URI=mongodb://localhost:27017/payment_gateway
NODE_ENV=development
BASE_RETRY_DELAY_MS=2000
MAX_RETRIES=3
GATEWAY_TIMEOUT_MS=10000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=30000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
RETRY_QUEUE_POLL_MS=1000
RETRY_QUEUE_BATCH_SIZE=10
```

## Response Envelope

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": "message",
  "code": "ERROR_CODE"
}
```

## API Documentation

### Health

```http
GET /health
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

### Create Payment

```http
POST /api/payments
Idempotency-Key: unique-client-key
Content-Type: application/json
```

Body:

```json
{
  "amount": 49.99,
  "currency": "USD",
  "userId": "user-123"
}
```

Rules:

- `Idempotency-Key` is required.
- `amount` must be greater than `0`.
- `currency` must be one of `USD`, `EUR`, `GBP`, `INR`.
- `userId` is required.

Success response:

```json
{
  "success": true,
  "data": {
    "paymentId": "30c36de4-5f96-4e8e-81de-9b32b511033f",
    "status": "pending",
    "createdAt": "2026-05-06T09:00:00.000Z"
  }
}
```

Idempotent replay:

- Sending the same `Idempotency-Key` again returns the exact cached response body.
- It does not create a second `Payment`.
- It does not start duplicate processing.

### Get Payment

```http
GET /api/payments/:paymentId
```

Success response:

```json
{
  "success": true,
  "data": {
    "paymentId": "30c36de4-5f96-4e8e-81de-9b32b511033f",
    "status": "success",
    "amount": 49.99,
    "currency": "USD",
    "retryCount": 1,
    "createdAt": "2026-05-06T09:00:00.000Z",
    "updatedAt": "2026-05-06T09:00:03.000Z"
  }
}
```

Not found response:

```json
{
  "success": false,
  "error": "Payment not found",
  "code": "PAYMENT_NOT_FOUND"
}
```

### List Payments

```http
GET /api/payments?userId=user-123&status=success&page=1&limit=10
```

Query parameters:

- `userId`: optional user filter.
- `status`: optional; one of `pending`, `processing`, `success`, `failed`.
- `page`: optional positive integer, default `1`.
- `limit`: optional integer from `1` to `100`, default `10`.

Success response:

```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "paymentId": "30c36de4-5f96-4e8e-81de-9b32b511033f",
        "status": "success",
        "amount": 49.99,
        "currency": "USD",
        "retryCount": 1,
        "createdAt": "2026-05-06T09:00:00.000Z",
        "updatedAt": "2026-05-06T09:00:03.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```

### Webhook

```http
POST /webhook
Content-Type: application/json
```

Body:

```json
{
  "paymentId": "30c36de4-5f96-4e8e-81de-9b32b511033f",
  "status": "success",
  "gatewayRef": "gateway-reference-id",
  "timestamp": "2026-05-06T09:00:03.000Z"
}
```

Webhook behavior:

- Always returns HTTP `200`.
- Unknown payments are logged and ignored.
- Duplicate callbacks are logged and ignored.
- Matching final-state callbacks are ignored.
- Conflicting final-state callbacks are logged and do not overwrite the existing final state.
- Valid pending or processing payments are atomically updated using the `version` field.

Response:

```json
{
  "success": true,
  "data": {
    "received": true
  }
}
```

## Retry Queue

Live payment processing uses a MongoDB-backed retry queue.

- New payments are scheduled by setting `nextRetryAt`.
- A queue worker polls due payments using the compound index `{ status: 1, nextRetryAt: 1 }`.
- Each worker claim is atomic: pending payments are moved to `processing` with `$inc: { version: 1 }`.
- Failed attempts are moved back to `pending` with a future `nextRetryAt`.
- Exhausted payments are marked `failed`.

Backoff:

```text
Attempt 1: immediate
Attempt 2: 2000ms
Attempt 3: 4000ms
Attempt 4: 8000ms
```

## Circuit Breaker

The gateway simulator is wrapped by an in-memory circuit breaker:

- `CLOSED`: requests pass.
- `OPEN`: requests fail fast after five consecutive failures.
- `HALF_OPEN`: one trial request is allowed after the reset window.

## Testing

```bash
npm test
```

The tests cover:

- Payment creation and validation.
- Idempotency replay.
- Retry exhaustion and exponential backoff.
- Retry log creation.
- Concurrent processing lock behavior.
- Version increments.

## Client

```bash
npm run client:dev
npm run client:build
```

The React dashboard includes:

- Payment form.
- Status polling view.
- Payment history table.
