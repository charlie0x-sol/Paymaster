const client = require('./redisClient');
const config = require('./config');

class RulesEngine {
  constructor() {
  }

  isOnboardingTask(transaction) {
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

  async isSponsored(connection, transaction, publicKey) {
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
    // Estimate fee: (Client Signatures + Relayer Signature) * 5000 Lamports
    // Note: This is a rough estimate. For exact fees, we'd need getFeeForMessage.
    // Ideally, we assume 1 client signature + 1 relayer signature = 2 * 5000 = 10000 lamports.
    // If client has multiple signers, we count them.
    let numSignatures = 1; // Relayer
    if (transaction.signatures) {
        numSignatures += transaction.signatures.length;
    } else {
        numSignatures += 1; // Assume client signs
    }
    
    const estimatedFeeLamports = numSignatures * 5000;
    const estimatedFeeSol = estimatedFeeLamports / 1000000000;

    const costKey = `txn_cost:${publicKey}`;
    // incrbyfloat returns string in some redis versions, or float.
    // We store as string or float.
    const currentCost = await client.incrByFloat(costKey, estimatedFeeSol);

    if (currentCost > config.MAX_SPONSORED_AMOUNT_SOL) {
      return false;
    }

    return true;
  }
}

module.exports = new RulesEngine();