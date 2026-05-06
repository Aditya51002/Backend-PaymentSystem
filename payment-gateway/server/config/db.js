const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  logger.info('database.connected', { uri });
  return mongoose.connection;
}

module.exports = connectDB;
