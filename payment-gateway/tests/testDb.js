const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Payment = require('../server/models/Payment');
const IdempotencyKey = require('../server/models/IdempotencyKey');
const RetryLog = require('../server/models/RetryLog');
const circuitBreaker = require('../server/utils/circuitBreaker');

let replSet;

function resolveSystemBinary() {
  if (process.env.MONGOMS_SYSTEM_BINARY) {
    return process.env.MONGOMS_SYSTEM_BINARY;
  }

  const windowsBinary = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
  if (process.platform === 'win32' && fs.existsSync(windowsBinary)) {
    return windowsBinary;
  }

  return undefined;
}

async function connectTestDb() {
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_ASYNC_PROCESSING = 'true';
  process.env.CIRCUIT_BREAKER_THRESHOLD = process.env.CIRCUIT_BREAKER_THRESHOLD || '100';

  const systemBinary = resolveSystemBinary();

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: systemBinary ? { systemBinary, version: '8.2.4' } : undefined,
  });

  await mongoose.connect(replSet.getUri());
}

async function clearTestDb() {
  circuitBreaker.reset();
  await Promise.all([
    Payment.deleteMany({}),
    IdempotencyKey.deleteMany({}),
    RetryLog.deleteMany({}),
  ]);
}

async function disconnectTestDb() {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

module.exports = {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
};
