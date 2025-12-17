"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const web3 = __importStar(require("@solana/web3.js"));
const metrics_1 = require("./metrics");
const logger_1 = require("./logger");
class BalanceMonitor {
    constructor(connection, publicKey, lowBalanceThreshold = 1.0) {
        this.connection = connection;
        this.publicKey = publicKey;
        this.lowBalanceThreshold = lowBalanceThreshold;
        this.intervalId = null;
    }
    async checkBalance() {
        try {
            const balance = await this.connection.getBalance(this.publicKey);
            const solBalance = balance / web3.LAMPORTS_PER_SOL;
            // Update Prometheus Gauge
            metrics_1.walletBalanceGauge.set(solBalance);
            logger_1.logger.info('Current wallet balance', { balance: solBalance });
            if (solBalance < this.lowBalanceThreshold) {
                this.alertLowBalance(solBalance);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to check wallet balance', { error: error.message });
        }
    }
    alertLowBalance(balance) {
        logger_1.logger.warn('LOW BALANCE ALERT', {
            message: `Relayer wallet is running low on funds! Current: ${balance} SOL. Threshold: ${this.lowBalanceThreshold} SOL`
        });
        // In a real app, integrate with Slack/PagerDuty/Email here
    }
    start(intervalMs = 60000) {
        if (this.intervalId)
            return;
        logger_1.logger.info('Starting balance monitor', { intervalMs });
        // Initial check
        this.checkBalance();
        this.intervalId = setInterval(() => {
            this.checkBalance();
        }, intervalMs);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger_1.logger.info('Stopped balance monitor');
        }
    }
}
exports.default = BalanceMonitor;
