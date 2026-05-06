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

function buildPaymentResponse(payment) {
  return {
    paymentId: payment.paymentId,
    status: payment.status,
    createdAt: payment.createdAt,
  };
}

function isStandaloneTransactionError(error) {
  return error
    && typeof error.message === 'string'
    && error.message.includes('Transaction numbers are only allowed on a replica set member or mongos');
}

async function cacheResponse(idempotencyKey, paymentId, response) {
  try {
    await IdempotencyKey.updateOne(
      { key: idempotencyKey },
      {
        $setOnInsert: {
          key: idempotencyKey,
          paymentId,
          response,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (!error || error.code !== 11000) {
      throw error;
    }
  }
}

async function fetchExistingPaymentResponse(idempotencyKey) {
  const existingPayment = await Payment.findOne({ idempotencyKey }).lean();

  if (!existingPayment) {
    return null;
  }

  const response = buildPaymentResponse(existingPayment);
  await cacheResponse(idempotencyKey, existingPayment.paymentId, response);

  return response;
}

async function createPaymentWithoutTransaction(validated, idempotencyKey) {
  const existingPaymentResponse = await fetchExistingPaymentResponse(idempotencyKey);

  if (existingPaymentResponse) {
    return {
      response: existingPaymentResponse,
      payment: null,
      cached: true,
    };
  }

  try {
    const payment = await Payment.create({
      paymentId: uuidv4(),
      idempotencyKey,
      amount: validated.amount,
      currency: validated.currency,
      userId: validated.userId,
      status: 'pending',
      maxRetries: Number(process.env.MAX_RETRIES || 3),
    });

    const response = buildPaymentResponse(payment);
    await cacheResponse(idempotencyKey, payment.paymentId, response);

    return {
      response,
      payment,
      cached: false,
    };
  } catch (error) {
    if (error && error.code === 11000) {
      const duplicate = await fetchCachedResponse(idempotencyKey);
      if (duplicate) {
        return {
          response: duplicate.response,
          payment: null,
          cached: true,
        };
      }

      const duplicatePaymentResponse = await fetchExistingPaymentResponse(idempotencyKey);
      if (duplicatePaymentResponse) {
        return {
          response: duplicatePaymentResponse,
          payment: null,
          cached: true,
        };
      }
    }

    throw error;
  }
}

async function createPaymentWithTransaction(validated, idempotencyKey) {
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

      const [createdPayment] = await Payment.create(
        [
          {
            paymentId: uuidv4(),
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
      response = buildPaymentResponse(createdPayment);

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

    return {
      response,
      payment,
      cached: !payment,
    };
  } finally {
    await session.endSession();
  }
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

  try {
    let result;

    try {
      result = await createPaymentWithTransaction(validated, idempotencyKey);
    } catch (error) {
      if (!isStandaloneTransactionError(error)) {
        throw error;
      }

      logger.warn('payment.transaction_unavailable_using_fallback', {
        reason: error.message,
      });
      result = await createPaymentWithoutTransaction(validated, idempotencyKey);
    }

    if (result.cached) {
      return {
        response: result.response,
        cached: true,
      };
    }

    logger.info('payment.created', {
      paymentId: result.payment.paymentId,
      amount: result.payment.amount,
      currency: result.payment.currency,
    });

    if (shouldAutoProcess(options)) {
      setImmediate(async () => {
        try {
          await retryQueue.enqueuePayment(result.payment.paymentId, 0);
        } catch (error) {
          logger.error('payment.async_processing_error', {
            paymentId: result.payment.paymentId,
            error: error.message,
            stack: error.stack,
          });
        }
      });
    }

    return {
      response: result.response,
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
