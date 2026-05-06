const logger = require('./logger');

const circuit = {
  state: 'CLOSED',
  failureCount: 0,
  openedAt: null,
  halfOpenInFlight: false,
};

function getThreshold() {
  return Number(process.env.CIRCUIT_BREAKER_THRESHOLD || 5);
}

function getResetMs() {
  return Number(process.env.CIRCUIT_BREAKER_RESET_MS || 30000);
}

function openCircuit() {
  circuit.state = 'OPEN';
  circuit.openedAt = Date.now();
  circuit.halfOpenInFlight = false;
  logger.warn('circuit.open', { failureCount: circuit.failureCount });
}

function closeCircuit() {
  circuit.state = 'CLOSED';
  circuit.failureCount = 0;
  circuit.openedAt = null;
  circuit.halfOpenInFlight = false;
  logger.info('circuit.closed', {});
}

function transitionIfReady() {
  if (circuit.state === 'OPEN' && Date.now() - circuit.openedAt >= getResetMs()) {
    circuit.state = 'HALF_OPEN';
    circuit.halfOpenInFlight = false;
  }
}

function circuitOpenError() {
  const error = new Error('circuit_open — gateway unavailable');
  error.code = 'CIRCUIT_OPEN';
  return error;
}

async function execute(operation) {
  transitionIfReady();

  if (circuit.state === 'OPEN') {
    throw circuitOpenError();
  }

  if (circuit.state === 'HALF_OPEN') {
    if (circuit.halfOpenInFlight) {
      throw circuitOpenError();
    }
    circuit.halfOpenInFlight = true;
  }

  try {
    const result = await operation();
    closeCircuit();
    return result;
  } catch (error) {
    if (circuit.state === 'HALF_OPEN') {
      circuit.failureCount = 1;
      openCircuit();
      throw error;
    }

    circuit.failureCount += 1;
    if (circuit.failureCount >= getThreshold()) {
      openCircuit();
    }
    throw error;
  } finally {
    if (circuit.state === 'HALF_OPEN') {
      circuit.halfOpenInFlight = false;
    }
  }
}

function getState() {
  return { ...circuit };
}

function reset() {
  circuit.state = 'CLOSED';
  circuit.failureCount = 0;
  circuit.openedAt = null;
  circuit.halfOpenInFlight = false;
}

module.exports = {
  execute,
  getState,
  reset,
};
