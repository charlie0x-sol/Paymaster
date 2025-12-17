console.log('RedisClient: Loading redis...');
const { createClient } = require('redis');
console.log('RedisClient: Loading logger...');
const { logger } = require('./logger');

console.log('RedisClient: Creating client...');
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({
  url: redisUrl,
});

console.log('RedisClient: Setting up listeners...');
client.on('error', (err) => logger.error('Redis Client Error', { error: err.message }));
client.on('connect', () => logger.info('Redis Client Connected'));

module.exports = client;