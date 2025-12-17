// Configuration for the rules engine

module.exports = {
  // List of Program IDs that are considered "Onboarding Tasks" and are always sponsored (or have a separate limit)
  ALLOWED_PROGRAM_IDS: process.env.ALLOWED_PROGRAM_IDS 
    ? process.env.ALLOWED_PROGRAM_IDS.split(',') 
    : [
        'Memo1UhkJRfHyvLnmEyY2ency7v5tXgQr5A9uC2j6y8', // Memo Program (Example)
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program (Example)
        '11111111111111111111111111111111', // System Program
      ],

  // List of addresses that are banned from using the relayer
  BLACKLIST_ADDRESSES: process.env.BLACKLIST_ADDRESSES
    ? process.env.BLACKLIST_ADDRESSES.split(',')
    : [
        'BadActorAddress1111111111111111111111111111',
      ],
  
  // Max sponsored transactions per user
  MAX_SPONSORED_TRANSACTIONS: parseInt(process.env.MAX_SPONSORED_TRANSACTIONS || '5', 10),

  // Max sponsored amount in SOL per user (cumulative)
  MAX_SPONSORED_AMOUNT_SOL: parseFloat(process.env.MAX_SPONSORED_AMOUNT_SOL || '0.0001'),
};
