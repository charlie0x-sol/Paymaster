import request from 'supertest';
import * as web3 from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { app, server, balanceMonitor } from './src/index';
import client from './src/redisClient';

describe('Authentication Endpoints', () => {
  jest.setTimeout(30000);
  beforeEach(async () => {
      // Clear rate limits before each test
      await client.flushDb();
  });

  afterAll(async () => {
    await client.quit();
    balanceMonitor.stop();
    // server.close(); // Server is not started in tests (supertest uses app)
  });

  it('should issue a challenge nonce', async () => {
    const res = await request(app).get('/challenge');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('nonce');
    expect(res.body).toHaveProperty('relayerPublicKey');
  });

  it('should verify a valid signature and return a JWT', async () => {
    // 1. Get Nonce
    const challengeRes = await request(app).get('/challenge');
    const { nonce } = challengeRes.body;

    // 2. Sign Nonce
    const keypair = web3.Keypair.generate();
    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, keypair.secretKey);
    const signatureBase58 = bs58.encode(signature);

    // 3. Verify
    const verifyRes = await request(app)
      .post('/verify')
      .send({
        nonce,
        publicKey: keypair.publicKey.toBase58(),
        signature: signatureBase58
      });

    expect(verifyRes.statusCode).toEqual(200);
    expect(verifyRes.body).toHaveProperty('token');
  });

  it('should reject an invalid signature', async () => {
    // 1. Get Nonce
    const challengeRes = await request(app).get('/challenge');
    const { nonce } = challengeRes.body;

    // 2. Sign Wrong Message
    const keypair = web3.Keypair.generate();
    const message = new TextEncoder().encode('wrong-nonce');
    const signature = nacl.sign.detached(message, keypair.secretKey);
    const signatureBase58 = bs58.encode(signature);

    // 3. Verify
    const verifyRes = await request(app)
      .post('/verify')
      .send({
        nonce,
        publicKey: keypair.publicKey.toBase58(),
        signature: signatureBase58
      });

    expect(verifyRes.statusCode).toEqual(400);
  });
});