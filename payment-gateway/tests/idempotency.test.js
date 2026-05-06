const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DISABLE_ASYNC_PROCESSING = 'true';

const { app } = require('../server');
const Payment = require('../server/models/Payment');
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

describe('idempotency', () => {
  test('Same Idempotency-Key twice returns identical response', async () => {
    const payload = { amount: 15, currency: 'EUR', userId: 'user-2' };

    const first = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'same-key-1')
      .send(payload)
      .expect(201);

    const second = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'same-key-1')
      .send(payload)
      .expect(200);

    expect(second.body).toEqual(first.body);
  });

  test('Same Idempotency-Key twice creates only 1 Payment document', async () => {
    const payload = { amount: 19, currency: 'GBP', userId: 'user-3' };

    await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'same-key-2')
      .send(payload)
      .expect(201);

    await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'same-key-2')
      .send(payload)
      .expect(200);

    const count = await Payment.countDocuments({});
    expect(count).toBe(1);
  });
});
