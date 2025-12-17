const web3 = require('@solana/web3.js');
const request = require('supertest');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

// Mock redis client
jest.mock('./redisClient', () => ({
  connect: jest.fn().mockResolvedValue(),
  sendCommand: jest.fn(),
  set: jest.fn().mockResolvedValue(),
  get: jest.fn().mockResolvedValue('true'),
  del: jest.fn().mockResolvedValue(),
  incr: jest.fn().mockResolvedValue(1),
  incrByFloat: jest.fn().mockResolvedValue(0.000001),
}));

// Mock rate-limit-redis
jest.mock('rate-limit-redis', () => {
  return {
    RedisStore: jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      increment: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date(Date.now() + 1000) }),
      decrement: jest.fn(),
      resetKey: jest.fn(),
    })),
  };
});

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({
      requestAirdrop: jest.fn().mockResolvedValue('mock-airdrop-sig'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
      getRecentBlockhash: jest.fn().mockResolvedValue({ blockhash: 'GHtXQBsoZHVnNFa9YevAzfr17YaaLtZKGZq89R5yVoV8', feeCalculator: { lamportsPerSignature: 5000 } }),
      sendRawTransaction: jest.fn().mockResolvedValue('mock-tx-sig'),
      getBalance: jest.fn().mockResolvedValue(2 * 1000000000),
      simulateTransaction: jest.fn().mockResolvedValue({ value: { err: null, logs: [] } }),
      getFeeForMessage: jest.fn().mockResolvedValue({ value: 5000 }),
    })),
    sendAndConfirmRawTransaction: jest.fn().mockResolvedValue('mock-tx-sig'),
  };
});

describe('Key Rotation', () => {
  let app, server, balanceMonitor;
  let primaryKey, oldKey;

  beforeAll(async () => {
    jest.resetModules();
    
    // Generate two keys
    primaryKey = web3.Keypair.generate();
    oldKey = web3.Keypair.generate();

    // Set env vars
    process.env.SERVER_PRIVATE_KEY = Buffer.from(primaryKey.secretKey).toString('hex');
    process.env.SERVER_PRIVATE_KEY_OLD = Buffer.from(oldKey.secretKey).toString('hex');
    process.env.JWT_SECRET = 'test-secret';

    const index = require('./index');
    app = index.app;
    balanceMonitor = index.balanceMonitor;
    server = await index.startServer(0);
  });

  afterAll((done) => {
    if (balanceMonitor) balanceMonitor.stop();
    if (server) {
        server.close(done);
    } else {
        done();
    }
  });

  it('should accept transactions signed by the old key (Secondary)', async () => {
    // 1. Get a token (Client auth)
    const clientKeypair = web3.Keypair.generate();
    
    // Skip challenge/verify dance for brevity, mock token issuance if possible 
    // OR just go through it. Let's go through it to be safe.
    
    // Challenge
    const challengeRes = await request(app).get('/challenge');
    const nonce = challengeRes.body.nonce;
    
    // Verify
    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, clientKeypair.secretKey);
    const verifyRes = await request(app).post('/verify').send({
        nonce,
        publicKey: clientKeypair.publicKey.toBase58(),
        signature: bs58.default.encode(signature),
    });
    const token = verifyRes.body.token;

    // 2. Create transaction with OLD key as fee payer
    const solanaNetwork = process.env.SOLANA_NETWORK || 'devnet';
    const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork)); // Mocked
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: clientKeypair.publicKey,
        toPubkey: web3.Keypair.generate().publicKey,
        lamports: 100,
      })
    );
    transaction.feePayer = oldKey.publicKey;
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.sign(clientKeypair);
    
    // 3. Relay
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
    const relayRes = await request(app)
      .post('/relay')
      .set('Authorization', `Bearer ${token}`)
      .send({ transaction: serializedTransaction.toString('base64') });

    expect(relayRes.statusCode).toEqual(200);
    expect(relayRes.body.success).toBe(true);
  });

  it('should return the primary key from /challenge', async () => {
    const res = await request(app).get('/challenge');
    expect(res.body.relayerPublicKey).toEqual(primaryKey.publicKey.toBase58());
  });
});
