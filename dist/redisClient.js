"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const logger_1 = require("./logger");
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const client = (0, redis_1.createClient)({
    url: redisUrl,
});
client.on('error', (err) => logger_1.logger.error('Redis Client Error', { error: err.message }));
client.on('connect', () => logger_1.logger.info('Redis Client Connected'));
exports.default = client;
