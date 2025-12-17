
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const secretKey = JSON.parse(fs.readFileSync('paymaster-keypair.json'));
const kp = Keypair.fromSecretKey(Uint8Array.from(secretKey));
console.log(`Paymaster Public Key: ${kp.publicKey.toBase58()}`);
