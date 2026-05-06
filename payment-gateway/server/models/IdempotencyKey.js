const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
    },
    paymentId: {
      type: String,
      required: true,
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
