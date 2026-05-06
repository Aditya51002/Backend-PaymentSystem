const mongoose = require('mongoose');

const retryLogSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      index: true,
    },
    attempt: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['attempted', 'success', 'failed', 'timeout'],
    },
    error: {
      type: String,
    },
    delayMs: {
      type: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model('RetryLog', retryLogSchema);
