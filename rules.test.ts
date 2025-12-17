import * as web3 from '@solana/web3.js';
import config from './src/config';

// Mock redis client
// We need to mock BEFORE import
jest.mock('./src/redisClient', () => ({
  __esModule: true,
  default: {
    incr: jest.fn(),
    incrByFloat: jest.fn(),
    get: jest.fn(),
  }
}));

import client from './src/redisClient';
import rulesEngine from './src/rules';

describe('Sponsorship Rules Engine', () => {
  const mockConnection = {
    getFeeForMessage: jest.fn().mockResolvedValue({ value: 5000 })
  } as unknown as web3.Connection;

  const createMockTransaction = (overrides: any = {}): web3.Transaction => ({
    instructions: [],
    signatures: [],
    compileMessage: jest.fn().mockReturnValue('mock-message'),
    ...overrides
  }) as unknown as web3.Transaction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject a blacklisted user immediately', async () => {
    const blacklistedKey = config.BLACKLIST_ADDRESSES[0];
    expect(await rulesEngine.isSponsored(mockConnection, {} as web3.Transaction, blacklistedKey)).toBe(false);
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('should sponsor an onboarding task (Allowed Program ID) regardless of limit', async () => {
    const publicKey = 'test-public-key-onboarding';
    const allowedProgramId = new web3.PublicKey(config.ALLOWED_PROGRAM_IDS[0]);
    
    const transaction = createMockTransaction({
      instructions: [
        {
          programId: allowedProgramId,
          data: Buffer.from([]),
        }
      ]
    });

    expect(await rulesEngine.isSponsored(mockConnection, transaction, publicKey)).toBe(true);
    // Should NOT check redis for limit
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('should sponsor the first N transactions for a user', async () => {
    const publicKey = 'test-public-key';
    const limit = config.MAX_SPONSORED_TRANSACTIONS;
    
    // Mock incr to return 1..limit
    // Mock incrByFloat to return 0.0 (well within limit)
    (client.incrByFloat as jest.Mock).mockResolvedValue('0.000001');

    for(let i=1; i<=limit; i++) {
        (client.incr as jest.Mock).mockResolvedValueOnce(i);
        expect(await rulesEngine.isSponsored(mockConnection, createMockTransaction(), publicKey)).toBe(true);
    }
  });

  it('should not sponsor transaction over the count limit if not onboarding', async () => {
    const publicKey = 'test-public-key-limit';
    const limit = config.MAX_SPONSORED_TRANSACTIONS;

    // Return limit + 1
    (client.incr as jest.Mock).mockResolvedValueOnce(limit + 1);

    const transaction = createMockTransaction({
        instructions: [
            {
                programId: web3.Keypair.generate().publicKey,
                data: Buffer.from([]),
            }
        ]
    });

    expect(await rulesEngine.isSponsored(mockConnection, transaction, publicKey)).toBe(false);
  });

  it('should not sponsor transaction if cost limit exceeded', async () => {
    const publicKey = 'test-public-key-cost';
    
    // Count is fine
    (client.incr as jest.Mock).mockResolvedValueOnce(1);
    
    // Cost is exceeded (0.0001 is limit, return 0.0002)
    (client.incrByFloat as jest.Mock).mockResolvedValueOnce('0.0002');

    const transaction = createMockTransaction({
        signatures: [1] // 1 signature
    });

    expect(await rulesEngine.isSponsored(mockConnection, transaction, publicKey)).toBe(false);
  });
});
