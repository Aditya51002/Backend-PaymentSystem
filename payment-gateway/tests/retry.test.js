process.env.NODE_ENV = 'test';
process.env.DISABLE_ASYNC_PROCESSING = 'true';
process.env.CIRCUIT_BREAKER_THRESHOLD = '100';

const Payment = require('../server/models/Payment');
const RetryLog = require('../server/models/RetryLog');
const retryEngine = require('../server/services/retryEngine');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./testDb');

beforeAll(async () => {
  await connectTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

async function createProcessingPayment(overrides = {}) {
  return Payment.create({
    paymentId: overrides.paymentId || `payment-${Date.now()}-${Math.random()}`,
    idempotencyKey: overrides.idempotencyKey || `idem-${Date.now()}-${Math.random()}`,
    amount: 25,
    currency: 'USD',
    userId: 'retry-user',
    status: 'processing',
    maxRetries: 3,
    ...overrides,
  });
}

function failingGateway(message = 'payment_declined') {
  return async () => {
    const error = new Error(message);
    error.code = 'PAYMENT_DECLINED';
    error.gatewayResponse = {
      status: 'failed',
      error: message,
    };
    throw error;
  };
}

describe('retry engine', () => {
  test('Payment retries up to maxRetries on gateway failure', async () => {
    const payment = await createProcessingPayment();

    await retryEngine.run(payment, {
      gatewayCharge: failingGateway(),
      sleepFn: async () => {},
      baseDelayMs: 2000,
    });

    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.retryCount).toBe(4);
  });

  test('Payment marked "failed" after maxRetries exhausted', async () => {
    const payment = await createProcessingPayment();

    await retryEngine.run(payment, {
      gatewayCharge: failingGateway(),
      sleepFn: async () => {},
      baseDelayMs: 2000,
    });

    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.status).toBe('failed');
  });

  test('Retry delay follows exponential backoff (2s, 4s, 8s)', () => {
    expect(retryEngine.calculateBackoffDelay(1, 2000)).toBe(2000);
    expect(retryEngine.calculateBackoffDelay(2, 2000)).toBe(4000);
    expect(retryEngine.calculateBackoffDelay(3, 2000)).toBe(8000);
  });

  test('RetryLog has one entry per attempt', async () => {
    const payment = await createProcessingPayment();

    await retryEngine.run(payment, {
      gatewayCharge: failingGateway(),
      sleepFn: async () => {},
      baseDelayMs: 2000,
    });

    const logs = await RetryLog.find({ paymentId: payment.paymentId }).sort({ attempt: 1 }).lean();
    expect(logs).toHaveLength(4);
    expect(logs.map((log) => log.attempt)).toEqual([1, 2, 3, 4]);
    expect(logs.map((log) => log.delayMs)).toEqual([0, 2000, 4000, 8000]);
  });
});
