import request from 'supertest';
import * as web3 from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { app, server, balanceMonitor } from './src/index';
import client from './src/redisClient';

// Mock connection to avoid real network calls
jest.mock('@solana/web3.js', () => {
  const originalModule = jest.requireActual('@solana/web3.js');
  return {
    ...originalModule,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1000000000), // 1 SOL
      simulateTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
      sendRawTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getFeeForMessage: jest.fn().mockResolvedValue({ value: 5000 }),
    })),
    sendAndConfirmRawTransaction: jest.fn().mockResolvedValue('mock-signature'),
  };
});

describe('E2E Transaction Relay', () => {
  let token: string;
  let userKeypair: web3.Keypair;

  beforeAll(async () => {
    // Clear rate limits
    await client.flushDb();

    // Authenticate first
    userKeypair = web3.Keypair.generate();
    
    // 1. Challenge
    const challengeRes = await request(app).get('/challenge');
    const { nonce } = challengeRes.body;

    // 2. Sign
    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, userKeypair.secretKey);
    
    // 3. Verify
    const verifyRes = await request(app).post('/verify').send({
      nonce,
      publicKey: userKeypair.publicKey.toBase58(),
      signature: bs58.encode(signature)
    });
    token = verifyRes.body.token;
  });

  afterAll(async () => {
    await client.quit();
    balanceMonitor.stop();
  });

  it('should relay a valid transaction', async () => {
    const transaction = new web3.Transaction();
    transaction.add(
        web3.SystemProgram.transfer({
            fromPubkey: userKeypair.publicKey,
            toPubkey: web3.Keypair.generate().publicKey,
            lamports: 100
        })
    );
    // Mock recent blockhash
    transaction.recentBlockhash = web3.Keypair.generate().publicKey.toBase58(); 
    // Mock fee payer (server key) - in real flow client gets it from /challenge
    // But here we rely on server finding it. 
    // Wait, the client usually needs to set the fee payer to the server's public key.
    // We need to fetch the server public key from /challenge or / endpoint.
    const rootRes = await request(app).get('/');
    const relayerPubKey = new web3.PublicKey(rootRes.body.relayerPublicKey);
    transaction.feePayer = relayerPubKey;

    // Sign with user
    transaction.partialSign(userKeypair);

    const serializedTx = transaction.serialize({ requireAllSignatures: false });
    const txBase64 = serializedTx.toString('base64');

    const res = await request(app)
      .post('/relay')
      .set('Authorization', `Bearer ${token}`)
      .send({ transaction: txBase64 });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('signature');
  });

  it('should reject unauthorized requests', async () => {
    const res = await request(app)
      .post('/relay')
      .send({ transaction: 'invalid' });
    
    expect(res.statusCode).toEqual(401);
  });
});