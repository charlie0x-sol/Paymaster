const { Keypair, SystemProgram, PublicKey } = require('@solana/web3.js');
const SmartClient = require('./SmartClient');

async function main() {
    const PAYMASTER_URL = process.env.PAYMASTER_URL || 'http://localhost:3000';
    
    // 1. Setup User
    const userKeypair = Keypair.generate();
    console.log(`User Public Key: ${userKeypair.publicKey.toBase58()}`);

    const client = new SmartClient(PAYMASTER_URL);

    try {
        // 2. Authenticate
        console.log('Authenticating with Paymaster...');
        await client.authenticate(userKeypair);
        console.log('Authentication successful.');

        // 3. Send a Reliable Transaction
        console.log('Sending transaction via SmartClient...');
        
        const instructions = [
            SystemProgram.transfer({
                fromPubkey: userKeypair.publicKey,
                toPubkey: userKeypair.publicKey, // transfer to self (0 SOL)
                lamports: 0,
            })
        ];

        const signature = await client.sendTransaction(instructions, userKeypair);
        console.log('\n✅ Transaction Success!');
        console.log(`Signature: ${signature}`);
        console.log(`View on Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    } catch (error) {
        console.error('\n❌ Transaction Failed:');
        console.error(error.message);
    }
}

main();
