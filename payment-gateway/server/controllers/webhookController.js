const Payment = require('../models/Payment');
const RetryLog = require('../models/RetryLog');
const logger = require('../utils/logger');

const FINAL_STATUSES = ['success', 'failed'];

async function recordWebhookEvent(paymentId, status, error) {
  await RetryLog.create({
    paymentId,
    attempt: 0,
    status,
    error,
    delayMs: 0,
  });
}

async function receiveWebhook(req, res) {
  const { paymentId, status, gatewayRef, timestamp } = req.body || {};

  try {
    logger.info('webhook.received', { paymentId, status });

    if (!paymentId || !FINAL_STATUSES.includes(status)) {
      return res.status(200).json({ success: true, data: { received: true } });
    }

    const payment = await Payment.findOne({ paymentId }).lean();

    if (!payment) {
      logger.warn('webhook.unknown_payment', { paymentId, status });
      return res.status(200).json({ success: true, data: { received: true } });
    }

    const duplicate = await RetryLog.exists({
      paymentId,
      attempt: 0,
      status,
      error: 'webhook',
    });

    if (duplicate) {
      logger.warn('webhook.duplicate', { paymentId });
      return res.status(200).json({ success: true, data: { received: true } });
    }

    if (FINAL_STATUSES.includes(payment.status)) {
      if (payment.status === status) {
        await recordWebhookEvent(paymentId, status, 'webhook');
        return res.status(200).json({ success: true, data: { received: true } });
      }

      logger.warn('webhook.conflict', {
        paymentId,
        existing: payment.status,
        incoming: status,
      });
      await recordWebhookEvent(paymentId, status, 'webhook_conflict');
      return res.status(200).json({ success: true, data: { received: true } });
    }

    const updated = await Payment.findOneAndUpdate(
      {
        paymentId,
        status: { $nin: FINAL_STATUSES },
        version: payment.version,
      },
      {
        $set: {
          status,
          gatewayResponse: {
            status,
            gatewayRef,
            timestamp,
            source: 'webhook',
          },
          nextRetryAt: null,
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    if (!updated) {
      const latest = await Payment.findOne({ paymentId }).lean();
      if (latest && latest.status !== status && FINAL_STATUSES.includes(latest.status)) {
        logger.warn('webhook.conflict', {
          paymentId,
          existing: latest.status,
          incoming: status,
        });
      } else {
        logger.warn('webhook.duplicate', { paymentId });
      }
      return res.status(200).json({ success: true, data: { received: true } });
    }

    await recordWebhookEvent(paymentId, status, 'webhook');
    return res.status(200).json({ success: true, data: { received: true } });
  } catch (error) {
    logger.error('webhook.error', {
      paymentId,
      status,
      error: error.message,
      stack: error.stack,
    });
    return res.status(200).json({ success: true, data: { received: true } });
  }
}

module.exports = {
  receiveWebhook,
};
