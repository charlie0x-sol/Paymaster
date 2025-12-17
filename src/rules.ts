import client from './redisClient';
import config from './config';
import { logger } from './logger';
import * as web3 from '@solana/web3.js';

class RulesEngine {
  constructor() {
  }

  isOnboardingTask(transaction: web3.Transaction): boolean {
    if (!transaction || !transaction.instructions) {
      return false;
    }

    for (const instruction of transaction.instructions) {
      // instruction.programId is a PublicKey object
      const programId = instruction.programId.toBase58();
      if (config.ALLOWED_PROGRAM_IDS.includes(programId)) {
        return true;
      }
    }
    return false;
  }

  async isSponsored(connection: web3.Connection, transaction: web3.Transaction, publicKey: string): Promise<boolean> {
    // 1. Check Blacklist
    if (config.BLACKLIST_ADDRESSES.includes(publicKey)) {
      return false;
    }

    // 2. Check if it's a specific onboarding task (Always sponsored, does not consume quota)
    if (this.isOnboardingTask(transaction)) {
      return true;
    }

    // 3. Check generic transaction limit (Count)
    const countKey = `txn_count:${publicKey}`;
    const count = await client.incr(countKey);
    if (count > config.MAX_SPONSORED_TRANSACTIONS) {
      return false;
    }

    // 4. Check dynamic gas limit (Cost)
    let estimatedFeeLamports: number;
    try {
      const message = transaction.compileMessage();
      const feeResponse = await connection.getFeeForMessage(message);
      if (feeResponse && feeResponse.value !== null) {
        estimatedFeeLamports = feeResponse.value;
      } else {
        throw new Error('Fee response null');
      }
    } catch (err: any) {
      // Fallback to rough estimate if API fails
      logger.warn('Failed to get exact fee, using estimate', { error: err.message });
      let numSignatures = 1; // Relayer
      if (transaction.signatures) {
          numSignatures += transaction.signatures.length;
      } else {
          numSignatures += 1; // Assume client signs
      }
      estimatedFeeLamports = numSignatures * 5000;
    }

    const estimatedFeeSol = estimatedFeeLamports / 1000000000;

    const costKey = `txn_cost:${publicKey}`;
    // incrbyfloat returns string in some redis versions, or float.
    // We store as string or float.
    const currentCostStr = await client.incrByFloat(costKey, estimatedFeeSol);
    const currentCost = parseFloat(currentCostStr.toString());

    if (currentCost > config.MAX_SPONSORED_AMOUNT_SOL) {
      return false;
    }

    return true;
  }
}

export default new RulesEngine();
