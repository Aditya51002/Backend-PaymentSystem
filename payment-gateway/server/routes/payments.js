const express = require('express');
const { body, query } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const idempotencyMiddleware = require('../middleware/idempotency');

const router = express.Router();

router.post(
  '/',
  idempotencyMiddleware,
  [
    body('amount')
      .exists({ checkFalsy: false })
      .withMessage('amount is required')
      .bail()
      .isFloat({ gt: 0 })
      .withMessage('amount must be greater than 0'),
    body('currency')
      .optional()
      .isIn(['USD', 'EUR', 'GBP', 'INR'])
      .withMessage('currency is invalid'),
    body('userId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('userId is required'),
  ],
  paymentController.createPayment
);

router.get(
  '/',
  [
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'success', 'failed'])
      .withMessage('status is invalid'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  paymentController.listPayments
);

router.get('/:paymentId', paymentController.getPayment);

module.exports = router;
