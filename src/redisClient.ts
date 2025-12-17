import { createClient } from 'redis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({
  url: redisUrl,
});

client.on('error', (err) => logger.error('Redis Client Error', { error: err.message }));
client.on('connect', () => logger.info('Redis Client Connected'));

export default client;
