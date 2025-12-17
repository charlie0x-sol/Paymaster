console.log('Starting server...');
import dotenv from 'dotenv';
dotenv.config();

// Fix: Import redisClient first to avoid potential dependency conflicts/hanging
import client from './redisClient';
import express, { Request, Response, NextFunction } from 'express';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import nacl from 'tweetnacl';
import jwt from 'jsonwebtoken';

import crypto from 'crypto';
import cors from 'cors';
import rulesEngine from './rules';
import { register, relaySuccessCounter, relayFailureCounter } from './metrics';
import BalanceMonitor from './monitor';
import { logger } from './logger';

const app = express();

// Trust proxy for rate limiting behind Render's load balancer
// See https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', process.env.TRUST_PROXY || 1);

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
if (!process.env.ALLOWED_ORIGINS) {
  logger.warn('ALLOWED_ORIGINS not set. Defaulting to "*" (all origins). This is insecure for production.');
}
app.use(cors({
  origin: allowedOrigins,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Connect to Redis
(async () => {
    console.log('Connecting to Redis...');
    try {
        await client.connect();
        console.log('Connected to Redis successfully.');
    } catch (e: any) {
        console.error('Failed to connect to Redis', { error: e.message });
        logger.error('Failed to connect to Redis', { error: e.message });
        process.exit(1); // Exit if Redis fails
    }
})();

// Debug Environment Variables
console.log('DEBUG: Environment Variables Keys:', Object.keys(process.env));
if (process.env.SERVER_PRIVATE_KEY) {
    console.log(`DEBUG: SERVER_PRIVATE_KEY length: ${process.env.SERVER_PRIVATE_KEY.length}`);
} else {
    console.log('DEBUG: SERVER_PRIVATE_KEY is MISSING from process.env');
}

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  store: new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
      prefix: 'rl:global:',
  }),
});
app.use(limiter);

// Stricter rate limiting for security and relay endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  store: new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
      prefix: 'rl:strict:',
  }),
});

console.log('Loading keypairs...');
const keypairs: web3.Keypair[] = [];
if (process.env.SERVER_PRIVATE_KEY) {
    console.log('Loading SERVER_PRIVATE_KEY...');
    try {
        const secretKeyBuffer = Buffer.from(process.env.SERVER_PRIVATE_KEY, 'hex');
        console.log(`DEBUG: Secret Key Buffer Length: ${secretKeyBuffer.length}`);
        keypairs.push(web3.Keypair.fromSecretKey(secretKeyBuffer));
        console.log('SERVER_PRIVATE_KEY loaded successfully.');
    } catch (e: any) {
        console.error('Failed to load SERVER_PRIVATE_KEY', { error: e.message });
        logger.error('Failed to load SERVER_PRIVATE_KEY', { error: e.message });
    }
}
if (process.env.SERVER_PRIVATE_KEY_OLD) {
    console.log('Loading SERVER_PRIVATE_KEY_OLD...');
    try {
        keypairs.push(web3.Keypair.fromSecretKey(Buffer.from(process.env.SERVER_PRIVATE_KEY_OLD, 'hex')));
        console.log('SERVER_PRIVATE_KEY_OLD loaded successfully.');
    } catch (e: any) {
        console.error('Failed to load SERVER_PRIVATE_KEY_OLD', { error: e.message });
        logger.error('Failed to load SERVER_PRIVATE_KEY_OLD', { error: e.message });
    }
}
console.log('Keypairs loaded:', keypairs.length);

if (keypairs.length === 0) {
    console.error('No server private keys found! Exiting...');
    logger.error('No server private keys found! Exiting...');
    process.exit(1);
}

const primaryKeypair = keypairs[0];
const jwtSecret = process.env.JWT_SECRET || 'default_secret'; // Fallback for types, but verified logic ensures it's set usually

// Extend Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: any;
}

const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        logger.error('JWT verification failed', { error: err });
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

const solanaNetwork = process.env.SOLANA_NETWORK || 'devnet';
const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork as web3.Cluster));

// Start Balance Monitor (Monitor primary key)
const balanceMonitor = new BalanceMonitor(connection, primaryKeypair.publicKey);
// Don't start it immediately in test mode usually.
// We can handle cleanup in exports.

app.get('/', (req: Request, res: Response) => {
  res.send({
    service: 'paymaster-relayer',
    status: 'running',
    relayerPublicKey: primaryKeypair.publicKey.toBase58(),
  });
});

app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).send(ex);
  }
});

app.get('/challenge', strictLimiter, async (req: Request, res: Response) => {
  logger.info('GET /challenge');
  const nonce = crypto.randomBytes(16).toString('hex');
  // Store nonce with 5 minutes expiration
  await client.set(nonce, 'true', { PX: 5 * 60 * 1000 });
  res.send({ nonce, relayerPublicKey: primaryKeypair.publicKey.toBase58() });
});

app.post('/verify', strictLimiter, async (req: Request, res: Response) => {
  logger.info('POST /verify');
  const { nonce, publicKey, signature } = req.body;

  const storedNonce = await client.get(nonce);
  if (!storedNonce) {
    logger.warn('Invalid or expired nonce', { nonce });
    return res.status(400).send('Invalid or expired nonce');
  }

  const message = new TextEncoder().encode(nonce);
  const signatureBytes = bs58.decode(signature);
  const publicKeyBytes = bs58.decode(publicKey);

  if (!nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes)) {
    logger.warn('Invalid signature for nonce', { nonce, publicKey });
    return res.status(400).send('Invalid signature');
  }

  await client.del(nonce);

  const token = jwt.sign({ publicKey }, jwtSecret, { expiresIn: '15m' });

  logger.info('Verification successful, JWT issued', { publicKey });
  res.send({ success: true, token });
});

app.post('/relay', strictLimiter, authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  logger.info('POST /relay', { publicKey: req.user.publicKey });
  try {
    const { transaction } = req.body;
    if (!transaction) {
      logger.warn('Invalid relay request: missing transaction');
      relayFailureCounter.inc({ error_type: 'missing_transaction' });
      return res.status(400).send('Invalid request');
    }

    const txBuffer = Buffer.from(transaction, 'base64');
    logger.info('Deserializing transaction');
    const tx = web3.Transaction.from(txBuffer);

    logger.info('Checking rules');
    // Await the async rules engine check
    const isSponsored = await rulesEngine.isSponsored(connection, tx, req.user.publicKey);
    if (!isSponsored) {
      logger.warn('Transaction not eligible for sponsorship', { publicKey: req.user.publicKey });
      relayFailureCounter.inc({ error_type: 'not_sponsored' });
      return res.status(403).send('Transaction not sponsored');
    }

    // Identify which keypair is the fee payer
    const signingKeypair = keypairs.find(kp => tx.feePayer && tx.feePayer.equals(kp.publicKey));

    if (!signingKeypair) {
        logger.warn('Invalid fee payer', { feePayer: tx.feePayer ? tx.feePayer.toBase58() : 'undefined', expected: keypairs.map(k => k.publicKey.toBase58()) });
        relayFailureCounter.inc({ error_type: 'invalid_fee_payer' });
        return res.status(400).send('Invalid fee payer');
    }

    logger.info('Signing transaction', { feePayer: signingKeypair.publicKey.toBase58() });
    try {
      tx.partialSign(signingKeypair);
      logger.info('Partially signed');
    } catch (e: any) {
       logger.error('Partial sign failed', { message: e.message, stack: e.stack });
       relayFailureCounter.inc({ error_type: 'signing_failed' });
       throw e;
    }

    logger.info('Verifying signatures');
    if (!tx.verifySignatures()) {
      logger.warn('Invalid transaction signature', { publicKey: req.user.publicKey });
      relayFailureCounter.inc({ error_type: 'invalid_signature' });
      return res.status(400).send('Invalid signature');
    }

    logger.info('Simulating transaction');
    const simulationResult = await connection.simulateTransaction(tx);
    if (simulationResult.value.err) {
        logger.warn('Transaction simulation failed', { err: simulationResult.value.err, logs: simulationResult.value.logs });
        relayFailureCounter.inc({ error_type: 'simulation_failed' });
        return res.status(400).send({ error: 'Transaction simulation failed', details: simulationResult.value.err, logs: simulationResult.value.logs });
    }

    let serializedTx;
    try {
        serializedTx = tx.serialize();
        logger.info('Serialized transaction');
    } catch (e: any) {
        logger.error('Serialization failed', { message: e.message, stack: e.stack });
        relayFailureCounter.inc({ error_type: 'serialization_failed' });
        throw e;
    }

    logger.info('Sending transaction');
    const signature = await web3.sendAndConfirmRawTransaction(connection, serializedTx);

    logger.info('Transaction relayed successfully', { signature });
    relaySuccessCounter.inc();
    res.send({ success: true, signature });
  } catch (error: any) {
    logger.error('Error relaying transaction', { message: error.message, stack: error.stack });
    relayFailureCounter.inc({ error_type: 'relay_execution_error' });
    res.status(500).send('Internal server error');
  }
});

const port = process.env.PORT || 3000;
let server: any;

const startServer = (portToUse: string | number) => {
    return new Promise((resolve) => {
        server = app.listen(portToUse, () => {
            logger.info(`Server is running on port ${portToUse}`);
            balanceMonitor.start();
            resolve(server);
        });
        server.setTimeout(30000); // 30 seconds timeout
        server.keepAliveTimeout = 30000;
        server.headersTimeout = 31000;
    });
};

if (require.main === module) {
    console.log('Starting server...');
    startServer(port);
}

export { app, startServer, balanceMonitor, server };
