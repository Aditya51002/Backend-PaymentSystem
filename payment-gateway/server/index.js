require('dotenv').config();

const express = require('express');
const connectDB = require('./config/db');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhook');
const apiRateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Idempotency-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
    },
  });
});

app.use('/api', apiRateLimiter);
app.use('/api/payments', paymentRoutes);
app.use('/webhook', webhookRoutes);
app.use(errorHandler);

async function startServer() {
  await connectDB();
  const port = Number(process.env.PORT || 5000);
  return app.listen(port, () => {
    logger.info('server.started', { port });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('server.start_failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
