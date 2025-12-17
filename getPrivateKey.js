const fs = require('fs');
const secretKey = JSON.parse(fs.readFileSync('paymaster-keypair.json'));
console.log(Buffer.from(secretKey).toString('hex'));