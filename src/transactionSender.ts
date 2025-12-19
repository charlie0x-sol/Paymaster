import {
  Connection,
  Transaction,
  TransactionSignature,
  BlockhashWithExpiryBlockHeight,
  SendOptions,
} from '@solana/web3.js';
import { logger } from './logger';

export interface SendTransactionOptions extends SendOptions {
  retryIntervalMs?: number;
}

export class TransactionSender {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Aggressively sends and confirms a transaction.
   * Re-broadcasts the transaction every `retryIntervalMs` until confirmed or expired.
   */
  async sendAndConfirm(
    serializedTx: Buffer,
    blockhashWithExpiry: BlockhashWithExpiryBlockHeight,
    options: SendTransactionOptions = {}
  ): Promise<TransactionSignature> {
    const {
      retryIntervalMs = 2000,
      skipPreflight = true,
      maxRetries = 0, // We handle retries ourselves
    } = options;

    const signature = await this.connection.sendRawTransaction(serializedTx, {
      skipPreflight,
      maxRetries,
    });

    logger.info(`Initial transaction sent: ${signature}`);

    const startTime = Date.now();
    let confirmed = false;
    let done = false;

    // Retry loop
    const retryPromise = (async () => {
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
        if (done) break;

        try {
          // Check if we already reached the last valid block height
          const currentBlockHeight = await this.connection.getBlockHeight();
          if (currentBlockHeight > blockhashWithExpiry.lastValidBlockHeight) {
            logger.warn(`Blockhash expired for tx ${signature}`);
            done = true;
            break;
          }

          await this.connection.sendRawTransaction(serializedTx, {
            skipPreflight: true,
            maxRetries: 0,
          });
          logger.debug(`Re-broadcasted tx ${signature}`);
        } catch (e: any) {
          logger.error(`Error during re-broadcast of ${signature}`, { error: e.message });
        }
      }
    })();

    // Confirmation listener
    try {
      const result = await this.connection.confirmTransaction(
        {
          signature,
          blockhash: blockhashWithExpiry.blockhash,
          lastValidBlockHeight: blockhashWithExpiry.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (result.value.err) {
        throw new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
      }

      confirmed = true;
      logger.info(`Transaction ${signature} confirmed`);
      return signature;
    } finally {
      done = true;
      await retryPromise;
    }
  }

  /**
   * Placeholder for Jito bundling logic.
   * In a real implementation, this would send to Jito Block Engine.
   */
  async sendViaJito(serializedTx: Buffer): Promise<TransactionSignature> {
    // For now, we fallback to our robust sender
    // But this is where Jito specific bundling would happen
    logger.warn('Jito bundling not fully implemented, falling back to aggressive rebroadcast');
    
    // We would need the blockhash expiry info here too.
    const tx = Transaction.from(serializedTx);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    
    return this.sendAndConfirm(serializedTx, { blockhash, lastValidBlockHeight });
  }
}
