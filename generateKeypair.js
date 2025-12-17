
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const keypair = Keypair.generate();
const secretKey = Buffer.from(keypair.secretKey);
const secretKeyHex = secretKey.toString('hex');

console.log('Public Key:', keypair.publicKey.toBase58());
console.log('Private Key (Hex):', secretKeyHex);
console.log('');
console.log('Add the following to your .env file:');
console.log(`SERVER_PRIVATE_KEY=${secretKeyHex}`);

// Optional: still save to JSON if needed, but Hex is priority for config
fs.writeFileSync('paymaster-keypair.json', JSON.stringify(Array.from(keypair.secretKey)));
console.log('\nKeypair also saved to paymaster-keypair.json (array format)');
