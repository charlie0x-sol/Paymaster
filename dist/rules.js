"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redisClient_1 = __importDefault(require("./redisClient"));
const config_1 = __importDefault(require("./config"));
const logger_1 = require("./logger");
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
            if (config_1.default.ALLOWED_PROGRAM_IDS.includes(programId)) {
                return true;
            }
        }
        return false;
    }
    async isSponsored(connection, transaction, publicKey) {
        // 1. Check Blacklist
        if (config_1.default.BLACKLIST_ADDRESSES.includes(publicKey)) {
            return false;
        }
        // 2. Check if it's a specific onboarding task (Always sponsored, does not consume quota)
        if (this.isOnboardingTask(transaction)) {
            return true;
        }
        // 3. Check generic transaction limit (Count)
        const countKey = `txn_count:${publicKey}`;
        const count = await redisClient_1.default.incr(countKey);
        if (count > config_1.default.MAX_SPONSORED_TRANSACTIONS) {
            return false;
        }
        // 4. Check dynamic gas limit (Cost)
        let estimatedFeeLamports;
        try {
            const message = transaction.compileMessage();
            const feeResponse = await connection.getFeeForMessage(message);
            if (feeResponse && feeResponse.value !== null) {
                estimatedFeeLamports = feeResponse.value;
            }
            else {
                throw new Error('Fee response null');
            }
        }
        catch (err) {
            // Fallback to rough estimate if API fails
            logger_1.logger.warn('Failed to get exact fee, using estimate', { error: err.message });
            let numSignatures = 1; // Relayer
            if (transaction.signatures) {
                numSignatures += transaction.signatures.length;
            }
            else {
                numSignatures += 1; // Assume client signs
            }
            estimatedFeeLamports = numSignatures * 5000;
        }
        const estimatedFeeSol = estimatedFeeLamports / 1000000000;
        const costKey = `txn_cost:${publicKey}`;
        // incrbyfloat returns string in some redis versions, or float.
        // We store as string or float.
        const currentCostStr = await redisClient_1.default.incrByFloat(costKey, estimatedFeeSol);
        const currentCost = parseFloat(currentCostStr.toString());
        if (currentCost > config_1.default.MAX_SPONSORED_AMOUNT_SOL) {
            return false;
        }
        return true;
    }
}
exports.default = new RulesEngine();
