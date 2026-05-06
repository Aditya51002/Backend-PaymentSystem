function idempotencyMiddleware(req, res, next) {
  const key = req.get('Idempotency-Key');

  if (!key || key.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Idempotency-Key header is required',
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  }

  req.idempotencyKey = key.trim();
  return next();
}

module.exports = idempotencyMiddleware;
