"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionSender = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("./logger");
class TransactionSender {
    constructor(connection) {
        this.connection = connection;
    }
    /**
     * Aggressively sends and confirms a transaction.
     * Re-broadcasts the transaction every `retryIntervalMs` until confirmed or expired.
     */
    async sendAndConfirm(serializedTx, blockhashWithExpiry, options = {}) {
        const { retryIntervalMs = 2000, skipPreflight = true, maxRetries = 0, // We handle retries ourselves
         } = options;
        const signature = await this.connection.sendRawTransaction(serializedTx, {
            skipPreflight,
            maxRetries,
        });
        logger_1.logger.info(`Initial transaction sent: ${signature}`);
        const startTime = Date.now();
        let confirmed = false;
        let done = false;
        // Retry loop
        const retryPromise = (async () => {
            while (!done) {
                await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
                if (done)
                    break;
                try {
                    // Check if we already reached the last valid block height
                    const currentBlockHeight = await this.connection.getBlockHeight();
                    if (currentBlockHeight > blockhashWithExpiry.lastValidBlockHeight) {
                        logger_1.logger.warn(`Blockhash expired for tx ${signature}`);
                        done = true;
                        break;
                    }
                    await this.connection.sendRawTransaction(serializedTx, {
                        skipPreflight: true,
                        maxRetries: 0,
                    });
                    logger_1.logger.debug(`Re-broadcasted tx ${signature}`);
                }
                catch (e) {
                    logger_1.logger.error(`Error during re-broadcast of ${signature}`, { error: e.message });
                }
            }
        })();
        // Confirmation listener
        try {
            const result = await this.connection.confirmTransaction({
                signature,
                blockhash: blockhashWithExpiry.blockhash,
                lastValidBlockHeight: blockhashWithExpiry.lastValidBlockHeight,
            }, 'confirmed');
            if (result.value.err) {
                throw new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
            }
            confirmed = true;
            logger_1.logger.info(`Transaction ${signature} confirmed`);
            return signature;
        }
        finally {
            done = true;
            await retryPromise;
        }
    }
    /**
     * Placeholder for Jito bundling logic.
     * In a real implementation, this would send to Jito Block Engine.
     */
    async sendViaJito(serializedTx) {
        // For now, we fallback to our robust sender
        // But this is where Jito specific bundling would happen
        logger_1.logger.warn('Jito bundling not fully implemented, falling back to aggressive rebroadcast');
        // We would need the blockhash expiry info here too.
        const tx = web3_js_1.Transaction.from(serializedTx);
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return this.sendAndConfirm(serializedTx, { blockhash, lastValidBlockHeight });
    }
}
exports.TransactionSender = TransactionSender;
