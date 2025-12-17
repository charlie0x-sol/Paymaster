const { Connection, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const PAYMASTER_PUBKEY = '4nw5BRdh4wmqFHRPcm2JpSA6caMXT5WYwxDShESsLaVf';
// The user provided private key (Base58)
const SOURCE_SECRET_KEY_B58 = '37a8pKhbk8zyiLsRr2bvjeG3f9q1Fmxb6ibdMxxubnp1t63i97RjvYzonxX4YygJ2TnwrcsokH2Dcwjktj2CXt9U';

async function main() {
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Decode source keypair
    const secretKey = bs58.default.decode(SOURCE_SECRET_KEY_B58);
    const sourceKeypair = Keypair.fromSecretKey(secretKey);

    console.log(`Source Public Key: ${sourceKeypair.publicKey.toBase58()}`);
    
    const balance = await connection.getBalance(sourceKeypair.publicKey);
    console.log(`Source Balance: ${balance / 1e9} SOL`);

    if (balance < 1e9) {
        console.error('Insufficient funds in source wallet to transfer 1 SOL.');
        return;
    }

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: sourceKeypair.publicKey,
            toPubkey: new PublicKey(PAYMASTER_PUBKEY),
            lamports: 1 * 1e9, // 1 SOL
        })
    );

    console.log(`Transferring 1 SOL to ${PAYMASTER_PUBKEY}...`);
    
    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [sourceKeypair]);
        console.log(`Transfer successful! Signature: ${signature}`);
    } catch (err) {
        console.error('Transfer failed:', err);
    }
}

main();