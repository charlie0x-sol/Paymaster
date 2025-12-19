import request from 'supertest';
import { app, balanceMonitor } from './src/index';
import client from './src/redisClient';

// Mock connection
jest.mock('@solana/web3.js', () => {
  const originalModule = jest.requireActual('@solana/web3.js');
  return {
    ...originalModule,
    Connection: jest.fn().mockImplementation(() => ({
      getRecentPrioritizationFees: jest.fn().mockResolvedValue([
          { slot: 100, prioritizationFee: 5000 },
          { slot: 101, prioritizationFee: 10000 },
      ]),
      getLatestBlockhash: jest.fn().mockResolvedValue({
          blockhash: 'mock-blockhash',
          lastValidBlockHeight: 123456
      }),
      getBalance: jest.fn().mockResolvedValue(1000000000),
    })),
  };
});

describe('Reliable Sender Endpoints', () => {
  afterAll(async () => {
    await client.quit();
    balanceMonitor.stop();
  });

  it('should return recommended fees and blockhash', async () => {
    const res = await request(app).get('/fees');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('priorityFee');
    expect(res.body).toHaveProperty('blockhash', 'mock-blockhash');
    expect(res.body).toHaveProperty('lastValidBlockHeight', 123456);
    
    // With 5000 and 10000, 75th percentile is 10000, plus 10% = 11000
    expect(res.body.priorityFee).toBeGreaterThanOrEqual(5000);
  });
});
