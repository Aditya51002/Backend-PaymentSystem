const { validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const paymentService = require('../services/paymentService');

function validationError(message = 'Invalid request') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

async function createPayment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationError(errors.array()[0].msg);
    }

    const result = await paymentService.initiatePayment(req.body, req.idempotencyKey);
    return res.status(result.cached ? 200 : 201).json({
      success: true,
      data: result.response,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPayment(req, res, next) {
  try {
    const payment = await Payment.findOne({ paymentId: req.params.paymentId })
      .select('paymentId status amount currency retryCount createdAt updatedAt')
      .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    return next(error);
  }
}

async function listPayments(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationError(errors.array()[0].msg);
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('paymentId status amount currency retryCount createdAt updatedAt')
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        payments,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createPayment,
  getPayment,
  listPayments,
};
