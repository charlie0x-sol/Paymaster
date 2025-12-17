import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'solana-relayer'
});

// Enable the collection of default metrics
// client.collectDefaultMetrics({ register });

// Define custom metrics
const relaySuccessCounter = new client.Counter({
  name: 'relayer_transactions_success_total',
  help: 'Total number of successfully relayed transactions',
  labelNames: ['program_id'], // Optional: label by program ID if we track it
});

const relayFailureCounter = new client.Counter({
  name: 'relayer_transactions_failed_total',
  help: 'Total number of failed relay attempts',
  labelNames: ['error_type'],
});

const walletBalanceGauge = new client.Gauge({
  name: 'relayer_wallet_balance_sol',
  help: 'Current SOL balance of the relayer wallet',
});

// Register custom metrics
register.registerMetric(relaySuccessCounter);
register.registerMetric(relayFailureCounter);
register.registerMetric(walletBalanceGauge);

export {
  register,
  relaySuccessCounter,
  relayFailureCounter,
  walletBalanceGauge,
};