const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const IdempotencyKey = require('../models/IdempotencyKey');
const retryEngine = require('./retryEngine');
const retryQueue = require('./retryQueue');
const logger = require('../utils/logger');

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];

function createHttpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validatePaymentInput({ amount, currency = 'USD', userId }) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw createHttpError('amount must be greater than 0', 400, 'INVALID_AMOUNT');
  }

  if (!VALID_CURRENCIES.includes(currency)) {
    throw createHttpError('currency is invalid', 400, 'INVALID_CURRENCY');
  }

  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw createHttpError('userId is required', 400, 'VALIDATION_ERROR');
  }

  return {
    amount: numericAmount,
    currency,
    userId: userId.trim(),
  };
}

function shouldAutoProcess(options) {
  if (options.autoProcess === false) {
    return false;
  }
  return process.env.DISABLE_ASYNC_PROCESSING !== 'true';
}

async function fetchCachedResponse(idempotencyKey) {
  return IdempotencyKey.findOne({ key: idempotencyKey }).lean();
}

async function initiatePayment(input, idempotencyKey, options = {}) {
  if (!idempotencyKey) {
    throw createHttpError('Idempotency-Key header is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  }

  const validated = validatePaymentInput(input);
  const existing = await fetchCachedResponse(idempotencyKey);

  if (existing) {
    return {
      response: existing.response,
      cached: true,
    };
  }

  const session = await mongoose.startSession();

  try {
    let response;
    let payment;

    await session.withTransaction(async () => {
      const existingInTransaction = await IdempotencyKey.findOne({ key: idempotencyKey })
        .session(session)
        .lean();

      if (existingInTransaction) {
        response = existingInTransaction.response;
        return;
      }

      const paymentId = uuidv4();
      const [createdPayment] = await Payment.create(
        [
          {
            paymentId,
            idempotencyKey,
            amount: validated.amount,
            currency: validated.currency,
            userId: validated.userId,
            status: 'pending',
            maxRetries: Number(process.env.MAX_RETRIES || 3),
          },
        ],
        { session }
      );

      payment = createdPayment;
      response = {
        paymentId: createdPayment.paymentId,
        status: 'pending',
        createdAt: createdPayment.createdAt,
      };

      await IdempotencyKey.create(
        [
          {
            key: idempotencyKey,
            paymentId: createdPayment.paymentId,
            response,
          },
        ],
        { session }
      );
    });

    if (!payment) {
      return {
        response,
        cached: true,
      };
    }

    logger.info('payment.created', {
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
    });

    if (shouldAutoProcess(options)) {
      setImmediate(async () => {
        try {
          await retryQueue.enqueuePayment(payment.paymentId, 0);
        } catch (error) {
          logger.error('payment.async_processing_error', {
            paymentId: payment.paymentId,
            error: error.message,
            stack: error.stack,
          });
        }
      });
    }

    return {
      response,
      cached: false,
    };
  } catch (error) {
    if (error && error.code === 11000) {
      const duplicate = await fetchCachedResponse(idempotencyKey);
      if (duplicate) {
        return {
          response: duplicate.response,
          cached: true,
        };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function processPayment(paymentId, currentVersion = 0) {
  const payment = await Payment.findOneAndUpdate(
    { paymentId, status: 'pending', version: currentVersion },
    {
      $set: { status: 'processing' },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!payment) {
    return null;
  }

  await retryEngine.run(payment);
  return payment;
}

module.exports = {
  initiatePayment,
  processPayment,
  validatePaymentInput,
};
