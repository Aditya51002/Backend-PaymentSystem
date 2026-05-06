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

describe('payments API', () => {
  test('POST /payments creates payment with status "pending"', async () => {
    const response = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'payment-create-1')
      .send({ amount: 42.5, currency: 'USD', userId: 'user-1' })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: {
        paymentId: expect.any(String),
        status: 'pending',
        createdAt: expect.any(String),
      },
    });

    const payment = await Payment.findOne({ paymentId: response.body.data.paymentId }).lean();
    expect(payment.status).toBe('pending');
    expect(payment.amount).toBe(42.5);
  });

  test('POST /payments returns 400 if amount is 0 or negative', async () => {
    await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'payment-invalid-0')
      .send({ amount: 0, currency: 'USD', userId: 'user-1' })
      .expect(400);

    await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'payment-invalid-negative')
      .send({ amount: -10, currency: 'USD', userId: 'user-1' })
      .expect(400);
  });

  test('POST /payments returns 400 if Idempotency-Key header missing', async () => {
    const response = await request(app)
      .post('/api/payments')
      .send({ amount: 20, currency: 'USD', userId: 'user-1' })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: 'Idempotency-Key header is required',
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  });

  test('GET /payments/:id returns 404 for unknown paymentId', async () => {
    const response = await request(app).get('/api/payments/unknown-payment').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: 'Payment not found',
      code: 'PAYMENT_NOT_FOUND',
    });
  });
});
