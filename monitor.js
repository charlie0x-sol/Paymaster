const web3 = require('@solana/web3.js');
const { walletBalanceGauge } = require('./metrics');
const { logger } = require('./logger');

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
      walletBalanceGauge.set(solBalance);

      logger.info('Current wallet balance', { balance: solBalance });

      if (solBalance < this.lowBalanceThreshold) {
        this.alertLowBalance(solBalance);
      }
    } catch (error) {
      logger.error('Failed to check wallet balance', { error: error.message });
    }
  }

  alertLowBalance(balance) {
    logger.warn('LOW BALANCE ALERT', { 
      message: `Relayer wallet is running low on funds! Current: ${balance} SOL. Threshold: ${this.lowBalanceThreshold} SOL` 
    });
    // In a real app, integrate with Slack/PagerDuty/Email here
  }

  start(intervalMs = 60000) { // Default 1 minute
    if (this.intervalId) return;
    logger.info('Starting balance monitor', { intervalMs });
    
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
      logger.info('Stopped balance monitor');
    }
  }
}

module.exports = BalanceMonitor;
