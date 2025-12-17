"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletBalanceGauge = exports.relayFailureCounter = exports.relaySuccessCounter = exports.register = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
// Create a Registry
const register = new prom_client_1.default.Registry();
exports.register = register;
// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'solana-relayer'
});
// Enable the collection of default metrics
// client.collectDefaultMetrics({ register });
// Define custom metrics
const relaySuccessCounter = new prom_client_1.default.Counter({
    name: 'relayer_transactions_success_total',
    help: 'Total number of successfully relayed transactions',
    labelNames: ['program_id'], // Optional: label by program ID if we track it
});
exports.relaySuccessCounter = relaySuccessCounter;
const relayFailureCounter = new prom_client_1.default.Counter({
    name: 'relayer_transactions_failed_total',
    help: 'Total number of failed relay attempts',
    labelNames: ['error_type'],
});
exports.relayFailureCounter = relayFailureCounter;
const walletBalanceGauge = new prom_client_1.default.Gauge({
    name: 'relayer_wallet_balance_sol',
    help: 'Current SOL balance of the relayer wallet',
});
exports.walletBalanceGauge = walletBalanceGauge;
// Register custom metrics
register.registerMetric(relaySuccessCounter);
register.registerMetric(relayFailureCounter);
register.registerMetric(walletBalanceGauge);
