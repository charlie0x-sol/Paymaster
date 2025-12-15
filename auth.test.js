// ... (imports remain)
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const request = require('supertest');

// Mock redis client
jest.mock('./redisClient', () => ({
  connect: jest.fn().mockResolvedValue(),
  sendCommand: jest.fn(),
  set: jest.fn().mockResolvedValue(),
  get: jest.fn().mockResolvedValue('true'), // Always valid nonce
  del: jest.fn().mockResolvedValue(),
}));

// Mock rate-limit-redis
jest.mock('rate-limit-redis', () => {
  return {
    RedisStore: jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      increment: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date(Date.now() + 1000) }),
      decrement: jest.fn(),
      resetKey: jest.fn(),
      prefix: 'mock:', // Add prefix to satisfy interface if needed
    })),
  };
});

describe('Auth Endpoints', () => {
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

  it('should get a challenge nonce', async () => {
    const res = await request(app).get('/challenge');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('nonce');
  });

  it('should verify a signed nonce and return a JWT', async () => {
    const keypair = web3.Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();

    const res = await request(app).get('/challenge');
    const nonce = res.body.nonce;

    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, keypair.secretKey);
    const signature58 = bs58.default.encode(signature);

    const verifyRes = await request(app)
      .post('/verify')
      .send({
        nonce,
        publicKey,
        signature: signature58,
      });

    expect(verifyRes.statusCode).toEqual(200);
    expect(verifyRes.body).toHaveProperty('success', true);
    expect(verifyRes.body).toHaveProperty('token');
  });
});
