const axios = require('axios');
const { Transaction, PublicKey, ComputeBudgetProgram } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const nacl = require('tweetnacl');

/**
 * SmartClient handles the complexities of Solana transaction delivery:
 * - Automatic authentication with Paymaster
 * - Dynamic fee fetching from Relayer
 * - Automatic blockhash management
 * - Client-side retry logic
 */
class SmartClient {
    /**
     * @param {string} paymasterUrl - URL of the Paymaster relayer
     */
    constructor(paymasterUrl) {
        this.paymasterUrl = paymasterUrl;
        this.token = null;
        this.relayerPublicKey = null;
    }

    /**
     * Authenticates the user with the Paymaster using a challenge-response mechanism.
     * @param {Keypair} userKeypair 
     */
    async authenticate(userKeypair) {
        const challengeRes = await axios.get(`${this.paymasterUrl}/challenge`);
        const { nonce, relayerPublicKey } = challengeRes.data;
        this.relayerPublicKey = new PublicKey(relayerPublicKey);

        const message = new TextEncoder().encode(nonce);
        const signature = nacl.sign.detached(message, userKeypair.secretKey);
        
        // Handle different bs58 export styles
        const signatureBase58 = typeof bs58.encode === 'function' 
            ? bs58.encode(signature) 
            : bs58.default.encode(signature);

        const verifyRes = await axios.post(`${this.paymasterUrl}/verify`, {
            nonce,
            publicKey: userKeypair.publicKey.toBase58(),
            signature: signatureBase58
        });

        this.token = verifyRes.data.token;
        return this.token;
    }

    /**
     * Build, sign, and send a transaction through the Paymaster.
     * @param {TransactionInstruction[]} instructions 
     * @param {Keypair} userKeypair 
     * @param {object} options 
     */
    async sendTransaction(instructions, userKeypair, options = {}) {
        if (!this.token) throw new Error("Not authenticated. Call authenticate() first.");

        const retries = options.retries || 3;
        let attempt = 0;

        while (attempt < retries) {
            attempt++;
            try {
                // 1. Get Recommended Fee and Fresh Blockhash from Paymaster
                // This ensures we are using the relayer's preferred fee market data
                const feeRes = await axios.get(`${this.paymasterUrl}/fees`);
                const { priorityFee, blockhash, lastValidBlockHeight } = feeRes.data;

                const transaction = new Transaction();
                
                // 2. Add Priority Fee Instruction
                transaction.add(ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: priorityFee
                }));

                // 3. Add User Instructions
                transaction.add(...instructions);

                transaction.feePayer = this.relayerPublicKey;
                transaction.recentBlockhash = blockhash;

                // 4. Sign as User
                transaction.partialSign(userKeypair);

                const serializedTx = transaction.serialize({ requireAllSignatures: false });
                const txBase64 = serializedTx.toString('base64');

                // 5. Submit to Relay
                const relayRes = await axios.post(`${this.paymasterUrl}/relay`, {
                    transaction: txBase64,
                    lastValidBlockHeight
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });

                return relayRes.data.signature;

            } catch (error) {
                const errorData = error.response ? error.response.data : error.message;
                console.warn(`[SmartClient] Attempt ${attempt} failed:`, JSON.stringify(errorData));
                
                // Don't retry if rejected by rules
                if (error.response && error.response.status === 403) {
                    throw new Error(`Rejected by Paymaster Rules: ${JSON.stringify(errorData)}`);
                }

                if (attempt >= retries) {
                    throw error;
                }
                
                // Exponential backoff
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
}

module.exports = SmartClient;
