const Payment = require('../models/Payment');
const RetryLog = require('../models/RetryLog');
const gatewaySimulator = require('./gatewaySimulator');
const circuitBreaker = require('../utils/circuitBreaker');
const logger = require('../utils/logger');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getBaseDelayMs() {
  return Number(process.env.BASE_RETRY_DELAY_MS || 2000);
}

function calculateBackoffDelay(retryCount, baseDelay = getBaseDelayMs()) {
  if (retryCount <= 0) {
    return 0;
  }
  return baseDelay * Math.pow(2, retryCount - 1);
}

function retryStatusFromError(error) {
  return error.code === 'GATEWAY_TIMEOUT' ? 'timeout' : 'failed';
}

async function markPaymentSuccess(paymentId, gatewayResponse) {
  return Payment.findOneAndUpdate(
    { paymentId, status: 'processing' },
    {
      $set: {
        status: 'success',
        gatewayResponse,
        nextRetryAt: null,
      },
      $inc: { version: 1 },
    },
    { new: true }
  );
}

async function markPaymentFailed(paymentId, gatewayResponse) {
  return Payment.findOneAndUpdate(
    { paymentId, status: 'processing' },
    {
      $set: {
        status: 'failed',
        gatewayResponse,
        nextRetryAt: null,
      },
      $inc: { version: 1 },
    },
    { new: true }
  );
}

async function run(payment, options = {}) {
  const paymentId = payment.paymentId;
  const maxRetries = Number(payment.maxRetries ?? process.env.MAX_RETRIES ?? 3);
  const baseDelayMs = Number(options.baseDelayMs ?? getBaseDelayMs());
  const sleepFn = options.sleepFn || sleep;
  const gatewayCharge = options.gatewayCharge || gatewaySimulator.charge;
  let retryCount = Number(payment.retryCount || 0);
  let lastError = null;

  while (retryCount <= maxRetries) {
    const attempt = retryCount + 1;
    const delayMs = attempt === 1 ? 0 : calculateBackoffDelay(retryCount, baseDelayMs);
    const retryLog = await RetryLog.create({
      paymentId,
      attempt,
      status: 'attempted',
      delayMs,
    });

    logger.info('payment.processing', { paymentId, attempt });

    await Payment.findOneAndUpdate(
      { paymentId, status: 'processing' },
      {
        $set: {
          lastAttemptAt: new Date(),
          nextRetryAt: null,
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    try {
      const gatewayResponse = await circuitBreaker.execute(async () => gatewayCharge(payment));
      await RetryLog.updateOne(
        { _id: retryLog._id },
        {
          $set: {
            status: 'success',
            error: null,
          },
        }
      );
      await markPaymentSuccess(paymentId, gatewayResponse);
      logger.info('payment.success', { paymentId, gatewayRef: gatewayResponse.gatewayRef });
      return { status: 'success', gatewayResponse };
    } catch (error) {
      lastError = error;
      const retryStatus = retryStatusFromError(error);
      const gatewayResponse = error.gatewayResponse || {
        status: 'failed',
        error: error.message,
        code: error.code,
      };

      await RetryLog.updateOne(
        { _id: retryLog._id },
        {
          $set: {
            status: retryStatus,
            error: error.message,
          },
        }
      );

      retryCount += 1;

      await Payment.findOneAndUpdate(
        { paymentId, status: 'processing' },
        {
          $set: {
            gatewayResponse,
          },
          $inc: {
            retryCount: 1,
            version: 1,
          },
        },
        { new: true }
      );

      if (retryCount <= maxRetries) {
        const nextDelayMs = calculateBackoffDelay(retryCount, baseDelayMs);
        const nextRetryAt = new Date(Date.now() + nextDelayMs);
        await Payment.findOneAndUpdate(
          { paymentId, status: 'processing' },
          {
            $set: { nextRetryAt },
            $inc: { version: 1 },
          },
          { new: true }
        );
        logger.warn('payment.retry', {
          paymentId,
          attempt: retryCount + 1,
          delay: nextDelayMs,
          error: error.message,
        });
        await sleepFn(nextDelayMs);
      } else {
        await markPaymentFailed(paymentId, gatewayResponse);
        logger.error('payment.failed', {
          paymentId,
          totalAttempts: attempt,
          error: error.message,
        });
        return { status: 'failed', error: error.message };
      }
    }
  }

  await markPaymentFailed(paymentId, {
    status: 'failed',
    error: lastError ? lastError.message : 'max_retries_exceeded',
  });
  return { status: 'failed', error: lastError ? lastError.message : 'max_retries_exceeded' };
}

module.exports = {
  run,
  calculateBackoffDelay,
};
