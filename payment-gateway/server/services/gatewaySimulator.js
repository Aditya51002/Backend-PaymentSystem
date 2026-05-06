const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error('gateway_timeout');
      error.code = 'GATEWAY_TIMEOUT';
      reject(error);
    }, ms);
  });
}

async function fireWebhook(payload) {
  const delay = randomInt(500, 2000);
  setTimeout(async () => {
    try {
      const port = process.env.PORT || 5000;
      const webhookUrl = process.env.WEBHOOK_URL || `http://localhost:${port}/webhook`;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      logger.warn('gateway.webhook_delivery_failed', {
        paymentId: payload.paymentId,
        error: error.message,
      });
    }
  }, delay);
}

async function gatewayCall(payment) {
  const roll = Math.random();
  let result;

  if (roll < 0.4) {
    await sleep(randomInt(200, 800));
    result = {
      status: 'success',
      gatewayRef: uuidv4(),
      timestamp: new Date().toISOString(),
    };
  } else if (roll < 0.7) {
    await sleep(randomInt(200, 800));
    result = {
      status: 'failed',
      gatewayRef: uuidv4(),
      error: 'payment_declined',
      timestamp: new Date().toISOString(),
    };
  } else if (roll < 0.9) {
    await sleep(11000);
    result = {
      status: 'failed',
      gatewayRef: uuidv4(),
      error: 'gateway_timeout',
      timestamp: new Date().toISOString(),
    };
  } else {
    await sleep(randomInt(2000, 5000));
    result = {
      status: 'success',
      gatewayRef: uuidv4(),
      timestamp: new Date().toISOString(),
    };
  }

  await fireWebhook({
    paymentId: payment.paymentId,
    status: result.status,
    gatewayRef: result.gatewayRef,
    timestamp: result.timestamp,
  });

  if (result.status === 'failed') {
    const error = new Error(result.error || 'payment_declined');
    error.code = result.error === 'gateway_timeout' ? 'GATEWAY_TIMEOUT' : 'PAYMENT_DECLINED';
    error.gatewayResponse = result;
    throw error;
  }

  return result;
}

async function charge(payment) {
  const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 10000);
  return Promise.race([gatewayCall(payment), timeoutAfter(timeoutMs)]);
}

module.exports = {
  charge,
};
