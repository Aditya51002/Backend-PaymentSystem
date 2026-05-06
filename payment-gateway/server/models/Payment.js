const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ['USD', 'EUR', 'GBP', 'INR'],
      default: 'USD',
    },
    userId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed'],
      default: 'pending',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    lastAttemptAt: {
      type: Date,
    },
    nextRetryAt: {
      type: Date,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

paymentSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
