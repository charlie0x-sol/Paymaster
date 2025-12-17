
const axios = require('axios');
const { Keypair, Transaction, TransactionInstruction, PublicKey, SystemProgram } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

const PAYMASTER_URL = 'http://localhost:3000';
// const MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLnmEyY2ency7v5tXgQr5A9uC2j6y8');

async function main() {
    // 1. Generate User
    const userKeypair = Keypair.generate();
    console.log(`User Public Key: ${userKeypair.publicKey.toBase58()}`);

    try {
        // 2. Authenticate
        console.log('Authenticating...');
        const challengeRes = await axios.get(`${PAYMASTER_URL}/challenge`);
        const { nonce } = challengeRes.data;

        const message = new TextEncoder().encode(nonce);
        const signature = nacl.sign.detached(message, userKeypair.secretKey);
        const signatureBase58 = bs58.default.encode(signature);

        const verifyRes = await axios.post(`${PAYMASTER_URL}/verify`, {
            nonce,
            publicKey: userKeypair.publicKey.toBase58(),
            signature: signatureBase58
        });

        const { token } = verifyRes.data;
        console.log('Authenticated! Token received.');

        // 3. Spam Transactions
        for (let i = 0; i < 5; i++) {
            console.log(`Sending transaction ${i + 1}/5...`);
            
            // Create a System Transfer transaction (0 SOL to self)
            const instruction = SystemProgram.transfer({
                fromPubkey: userKeypair.publicKey,
                toPubkey: userKeypair.publicKey,
                lamports: 0,
            });

            const transaction = new Transaction().add(instruction);
            
            // Important: Set fee payer to the user temporarily or leave empty?
            // The Relayer will set itself as fee payer. 
            // But we need a recent blockhash.
            // Since we are relaying, the client usually provides a transaction.
            // The server code: "const tx = web3.Transaction.from(txBuffer);" 
            // and "const signingKeypair = keypairs.find(kp => tx.feePayer.equals(kp.publicKey));"
            // Wait, the server code checks: `tx.feePayer.equals(kp.publicKey)`.
            // So the CLIENT must set the feePayer to the RELAYER'S public key!
            
            // We need to fetch the relayer's public key first or hardcode it.
            // It is returned in /challenge response: `relayerPublicKey`
            
            const relayerPubKeyStr = challengeRes.data.relayerPublicKey;
            const relayerPubKey = new PublicKey(relayerPubKeyStr);
            transaction.feePayer = relayerPubKey;

            // We also need a recent blockhash. The client normally fetches this.
            // Since this is a simple script, we can ask the public RPC.
            const { Connection, clusterApiUrl } = require('@solana/web3.js');
            const connection = new Connection(clusterApiUrl('devnet'));
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;

            // Sign with user (required for System Transfer)
            transaction.partialSign(userKeypair);
            
            const serializedTx = transaction.serialize({ requireAllSignatures: false });
            const txBase64 = serializedTx.toString('base64');

            const relayRes = await axios.post(`${PAYMASTER_URL}/relay`, {
                transaction: txBase64
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log(`Success! Signature: ${relayRes.data.signature}`);
        }

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

main();
