process.env.NODE_ENV = 'test';
process.env.DISABLE_ASYNC_PROCESSING = 'true';

const Payment = require('../server/models/Payment');
const paymentService = require('../server/services/paymentService');
const retryEngine = require('../server/services/retryEngine');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./testDb');

beforeAll(async () => {
  await connectTestDb();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('concurrency control', () => {
  test('Concurrent requests for same payment → only one processes', async () => {
    const payment = await Payment.create({
      paymentId: 'concurrent-payment-1',
      idempotencyKey: 'concurrent-key-1',
      amount: 12,
      currency: 'USD',
      userId: 'concurrency-user',
      status: 'pending',
      version: 0,
    });

    const runSpy = jest.spyOn(retryEngine, 'run').mockImplementation(async () => ({
      status: 'success',
    }));

    await Promise.all([
      paymentService.processPayment(payment.paymentId, payment.version),
      paymentService.processPayment(payment.paymentId, payment.version),
      paymentService.processPayment(payment.paymentId, payment.version),
      paymentService.processPayment(payment.paymentId, payment.version),
    ]);

    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  test('Version field increments on each update', async () => {
    await Payment.create({
      paymentId: 'version-payment-1',
      idempotencyKey: 'version-key-1',
      amount: 18,
      currency: 'INR',
      userId: 'version-user',
      status: 'pending',
      version: 0,
    });

    const first = await Payment.findOneAndUpdate(
      { paymentId: 'version-payment-1', status: 'pending', version: 0 },
      { $set: { status: 'processing' }, $inc: { version: 1 } },
      { new: true }
    );

    const second = await Payment.findOneAndUpdate(
      { paymentId: 'version-payment-1', status: 'processing', version: 1 },
      { $set: { status: 'success' }, $inc: { version: 1 } },
      { new: true }
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });
});
