const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';

  logger.error('request.error', {
    message: err.message,
    code,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  return res.status(statusCode).json({
    success: false,
    error: message,
    code,
  });
}

module.exports = errorHandler;
