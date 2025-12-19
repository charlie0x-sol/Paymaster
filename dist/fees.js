"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeEstimator = void 0;
const logger_1 = require("./logger");
class FeeEstimator {
    constructor(connection) {
        this.cacheDurationMs = 2000;
        this.lastFetchTime = 0;
        this.cachedFee = 0;
        this.connection = connection;
    }
    /**
     * Estimates a priority fee (in microLamports) based on recent network activity.
     * Returns a value suitable for ComputeBudgetProgram.setComputeUnitPrice.
     */
    async getPriorityFeeEstimate(lookbackSlots = 150) {
        const now = Date.now();
        if (now - this.lastFetchTime < this.cacheDurationMs) {
            return this.cachedFee;
        }
        try {
            const recentFees = await this.connection.getRecentPrioritizationFees({
                lockedWritableAccounts: [], // Look at global contention
            });
            if (recentFees.length === 0) {
                this.cachedFee = 1000; // Minimal default
                this.lastFetchTime = now;
                return this.cachedFee;
            }
            // Sort by slot descending to get most recent
            recentFees.sort((a, b) => b.slot - a.slot);
            // Take the top N recent slots
            const recentSamples = recentFees.slice(0, lookbackSlots);
            // Filter out zeros to find the "active" market
            const nonZeroFees = recentSamples.map(f => f.prioritizationFee).filter(f => f > 0);
            if (nonZeroFees.length === 0) {
                this.cachedFee = 1000; // Network is quiet
                this.lastFetchTime = now;
                return this.cachedFee;
            }
            // Sort fees to find percentiles
            nonZeroFees.sort((a, b) => a - b);
            // Strategy: 75th percentile + buffer
            // This ensures we are paying more than the majority of recent txs
            const index = Math.floor(nonZeroFees.length * 0.75);
            const fee = nonZeroFees[index];
            // Add 10% buffer and ensure integer
            this.cachedFee = Math.ceil(fee * 1.1);
            // Safety cap: 1,000,000 microLamports per CU. 
            // For a standard 200k CU tx, this is 0.2 SOL - quite high, but safe as a cap.
            if (this.cachedFee > 1000000) {
                logger_1.logger.warn(`Fee estimate suspiciously high: ${this.cachedFee}, capping at 1000000`);
                this.cachedFee = 1000000;
            }
            this.lastFetchTime = now;
            return this.cachedFee;
        }
        catch (error) {
            logger_1.logger.error('Error fetching prioritization fees', { error: error.message });
            // On error, return the last cached fee or a safe fallback
            return this.cachedFee || 5000;
        }
    }
}
exports.FeeEstimator = FeeEstimator;
