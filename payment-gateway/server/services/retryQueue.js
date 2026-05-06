const Payment = require('../models/Payment');
const retryEngine = require('./retryEngine');
const logger = require('../utils/logger');

const queueState = {
  timer: null,
  running: false,
  started: false,
};

function getPollMs() {
  return Number(process.env.RETRY_QUEUE_POLL_MS || 1000);
}

function getBatchSize() {
  return Number(process.env.RETRY_QUEUE_BATCH_SIZE || 10);
}

function clearQueueTimer() {
  if (queueState.timer) {
    clearTimeout(queueState.timer);
    queueState.timer = null;
  }
}

function scheduleSoon(delayMs = 0) {
  if (!queueState.started || process.env.DISABLE_ASYNC_PROCESSING === 'true') {
    return;
  }

  clearQueueTimer();
  queueState.timer = setTimeout(async () => {
    await drainDuePayments();
  }, Math.max(delayMs, 0));

  if (queueState.timer.unref) {
    queueState.timer.unref();
  }
}

async function enqueuePayment(paymentId, delayMs = 0) {
  const nextRetryAt = new Date(Date.now() + delayMs);
  await Payment.findOneAndUpdate(
    {
      paymentId,
      status: 'pending',
    },
    {
      $set: { nextRetryAt },
      $inc: { version: 1 },
    },
    { new: true }
  );

  scheduleSoon(delayMs);
}

async function claimDuePayment() {
  const now = new Date();
  return Payment.findOneAndUpdate(
    {
      status: 'pending',
      $or: [
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: null },
        { nextRetryAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        nextRetryAt: null,
      },
      $inc: { version: 1 },
    },
    {
      new: true,
      sort: { nextRetryAt: 1, createdAt: 1 },
    }
  );
}

async function processOneDuePayment() {
  const payment = await claimDuePayment();

  if (!payment) {
    return false;
  }

  try {
    await retryEngine.runQueuedAttempt(payment);
  } catch (error) {
    logger.error('retry_queue.processing_error', {
      paymentId: payment.paymentId,
      error: error.message,
      stack: error.stack,
    });
  }

  return true;
}

async function drainDuePayments() {
  if (queueState.running) {
    return;
  }

  queueState.running = true;

  try {
    for (let index = 0; index < getBatchSize(); index += 1) {
      const processed = await processOneDuePayment();
      if (!processed) {
        break;
      }
    }
  } finally {
    queueState.running = false;
    if (queueState.started) {
      scheduleSoon(getPollMs());
    }
  }
}

function start() {
  if (queueState.started || process.env.DISABLE_ASYNC_PROCESSING === 'true') {
    return;
  }

  queueState.started = true;
  scheduleSoon(0);
  logger.info('retry_queue.started', {
    pollMs: getPollMs(),
    batchSize: getBatchSize(),
  });
}

function stop() {
  queueState.started = false;
  clearQueueTimer();
}

function getState() {
  return { ...queueState, timer: Boolean(queueState.timer) };
}

module.exports = {
  start,
  stop,
  enqueuePayment,
  drainDuePayments,
  processOneDuePayment,
  getState,
};
