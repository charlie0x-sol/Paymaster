const web3 = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const request = require('supertest');

// Mock redis client
jest.mock('./redisClient', () => ({
  connect: jest.fn().mockResolvedValue(),
  sendCommand: jest.fn(),
  set: jest.fn().mockResolvedValue(),
  get: jest.fn().mockResolvedValue('true'),
  del: jest.fn().mockResolvedValue(),
  incr: jest.fn().mockResolvedValue(1), // Always return 1 so rules pass
  incrByFloat: jest.fn().mockResolvedValue(0.000001), // Return low cost
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

// Mock @solana/web3.js BEFORE importing index
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({
      requestAirdrop: jest.fn().mockResolvedValue('mock-airdrop-sig'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
      getRecentBlockhash: jest.fn().mockResolvedValue({ blockhash: 'GHtXQBsoZHVnNFa9YevAzfr17YaaLtZKGZq89R5yVoV8', feeCalculator: { lamportsPerSignature: 5000 } }),
      sendRawTransaction: jest.fn().mockResolvedValue('mock-tx-sig'),
      getBalance: jest.fn().mockResolvedValue(2 * 1000000000), // 2 SOL in lamports
      simulateTransaction: jest.fn().mockResolvedValue({ value: { err: null, logs: [] } }),
    })),
    sendAndConfirmRawTransaction: jest.fn().mockResolvedValue('mock-tx-sig'),
  };
});

describe('End-to-End Flow', () => {
  let app, server, balanceMonitor;

  beforeAll(async () => {
    jest.resetModules();
    const index = require('./index');
    app = index.app;
    balanceMonitor = index.balanceMonitor;
    // Start server on random port
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

  it('should complete the full challenge -> verify -> relay flow', async () => {
    // 1. Setup client and get airdrop (mocked)
    const clientKeypair = web3.Keypair.generate();
    const solanaNetwork = process.env.SOLANA_NETWORK || 'devnet';
    const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork));
    const airdropSignature = await connection.requestAirdrop(
      clientKeypair.publicKey,
      web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);

    // 2. Get challenge
    const challengeRes = await request(app).get('/challenge');
    const nonce = challengeRes.body.nonce;
    const relayerPublicKey = new web3.PublicKey(challengeRes.body.relayerPublicKey);

    // 3. Sign challenge and verify
    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, clientKeypair.secretKey);
    const signature58 = bs58.default.encode(signature);

    const verifyRes = await request(app)
      .post('/verify')
      .send({
        nonce,
        publicKey: clientKeypair.publicKey.toBase58(),
        signature: signature58,
      });

    const token = verifyRes.body.token;

    // 4. Create and sign transaction
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: clientKeypair.publicKey,
        toPubkey: web3.Keypair.generate().publicKey,
        lamports: web3.LAMPORTS_PER_SOL / 100,
      })
    );
    transaction.feePayer = relayerPublicKey;
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.sign(clientKeypair);

    // 5. Serialize and relay transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });

    const relayRes = await request(app)
      .post('/relay')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transaction: serializedTransaction.toString('base64'),
      });

    expect(relayRes.statusCode).toEqual(200);
    expect(relayRes.body).toHaveProperty('success', true);
    expect(relayRes.body).toHaveProperty('signature', 'mock-tx-sig');
  }, 30000); // Increase timeout for e2e test
});
