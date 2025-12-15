const web3 = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');

(async () => {
  try {
    // Create a new keypair for the client
    const clientKeypair = web3.Keypair.generate();

    // Connect to the devnet
    const solanaNetwork = process.env.SOLANA_NETWORK || 'devnet';
    const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork));

    // Airdrop some SOL to the client keypair
    console.log('Requesting airdrop...');
    const airdropSignature = await connection.requestAirdrop(
      clientKeypair.publicKey,
      web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);
    console.log('Airdrop successful!');

    // Create a simple transaction
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: clientKeypair.publicKey,
        toPubkey: web3.Keypair.generate().publicKey, // Send to a random new address
        lamports: web3.LAMPORTS_PER_SOL / 100, // 0.01 SOL
      })
    );

    // Set the recent blockhash
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;

    // Sign the transaction with the client's keypair
    transaction.sign(clientKeypair);

    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false, // We don't have the fee payer's signature yet
    });

    const relayUrl = 'http://localhost:3000/relay';
    console.log('Sending transaction to relayer...');
    const response = await axios.post(relayUrl, {
      transaction: serializedTransaction.toString('base64'),
    });

    console.log('Relayer response:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
})();
