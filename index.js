require('dotenv').config();
const express = require('express');
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const nacl = require('tweetnacl');
const jwt = require('jsonwebtoken');

const crypto = require('crypto');
const cors = require('cors');
const rulesEngine = require('./rules');
const client = require('./redisClient');
const { register, relaySuccessCounter, relayFailureCounter } = require('./metrics');
const BalanceMonitor = require('./monitor');
const { logger } = require('./logger');

const app = express();

// Trust proxy for rate limiting behind Render's load balancer
app.enable('trust proxy');

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
app.use(cors({
  origin: allowedOrigins,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Connect to Redis
(async () => {
    try {
        await client.connect();
    } catch (e) {
        logger.error('Failed to connect to Redis', { error: e.message });
    }
})();

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  store: new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
      prefix: 'rl:global:',
  }),
});
app.use(limiter);

// Stricter rate limiting for security and relay endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  store: new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
      prefix: 'rl:strict:',
  }),
});

const keypairs = [];
if (process.env.SERVER_PRIVATE_KEY) {
    try {
        keypairs.push(web3.Keypair.fromSecretKey(Buffer.from(process.env.SERVER_PRIVATE_KEY, 'hex')));
    } catch (e) {
        logger.error('Failed to load SERVER_PRIVATE_KEY', { error: e.message });
    }
}
if (process.env.SERVER_PRIVATE_KEY_OLD) {
    try {
        keypairs.push(web3.Keypair.fromSecretKey(Buffer.from(process.env.SERVER_PRIVATE_KEY_OLD, 'hex')));
    } catch (e) {
        logger.error('Failed to load SERVER_PRIVATE_KEY_OLD', { error: e.message });
    }
}

if (keypairs.length === 0) {
    logger.error('No server private keys found! Exiting...');
    process.exit(1);
}

const primaryKeypair = keypairs[0];
const jwtSecret = process.env.JWT_SECRET;

const authenticateJWT = (req, res, next) => {
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
const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork));

// Start Balance Monitor (Monitor primary key)
const balanceMonitor = new BalanceMonitor(connection, primaryKeypair.publicKey);
// Don't start it immediately in test mode usually, but for this prototype it's fine.
// We can handle cleanup in exports.

app.get('/', (req, res) => {
  res.send({
    service: 'paymaster-relayer',
    status: 'running',
    relayerPublicKey: primaryKeypair.publicKey.toBase58(),
  });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).send(ex);
  }
});

app.get('/challenge', strictLimiter, async (req, res) => {
  logger.info('GET /challenge');
  const nonce = crypto.randomBytes(16).toString('hex');
  // Store nonce with 5 minutes expiration
  await client.set(nonce, 'true', { PX: 5 * 60 * 1000 });
  res.send({ nonce, relayerPublicKey: primaryKeypair.publicKey.toBase58() });
});

app.post('/verify', strictLimiter, async (req, res) => {
  logger.info('POST /verify');
  const { nonce, publicKey, signature } = req.body;

  const storedNonce = await client.get(nonce);
  if (!storedNonce) {
    logger.warn('Invalid or expired nonce', { nonce });
    return res.status(400).send('Invalid or expired nonce');
  }

  const message = new TextEncoder().encode(nonce);
  const signatureBytes = bs58.default.decode(signature);
  const publicKeyBytes = bs58.default.decode(publicKey);

  if (!nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes)) {
    logger.warn('Invalid signature for nonce', { nonce, publicKey });
    return res.status(400).send('Invalid signature');
  }

  await client.del(nonce);

  const token = jwt.sign({ publicKey }, jwtSecret, { expiresIn: '15m' });

  logger.info('Verification successful, JWT issued', { publicKey });
  res.send({ success: true, token });
});

app.post('/relay', strictLimiter, authenticateJWT, async (req, res) => {
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
    const signingKeypair = keypairs.find(kp => tx.feePayer.equals(kp.publicKey));

    if (!signingKeypair) {
        logger.warn('Invalid fee payer', { feePayer: tx.feePayer.toBase58(), expected: keypairs.map(k => k.publicKey.toBase58()) });
        relayFailureCounter.inc({ error_type: 'invalid_fee_payer' });
        return res.status(400).send('Invalid fee payer');
    }

    logger.info('Signing transaction', { feePayer: signingKeypair.publicKey.toBase58() });
    try {
      tx.partialSign(signingKeypair);
      logger.info('Partially signed');
    } catch (e) {
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
    } catch (e) {
        logger.error('Serialization failed', { message: e.message, stack: e.stack });
        relayFailureCounter.inc({ error_type: 'serialization_failed' });
        throw e;
    }

    logger.info('Sending transaction');
    const signature = await web3.sendAndConfirmRawTransaction(connection, serializedTx);

    logger.info('Transaction relayed successfully', { signature });
    relaySuccessCounter.inc();
    res.send({ success: true, signature });
  } catch (error) {
    logger.error('Error relaying transaction', { message: error.message, stack: error.stack });
    relayFailureCounter.inc({ error_type: 'relay_execution_error' });
    res.status(500).send('Internal server error');
  }
});

const port = process.env.PORT || 3000;
let server;

const startServer = (portToUse) => {
    return new Promise((resolve) => {
        server = app.listen(portToUse, () => {
            logger.info(`Server is running on port ${portToUse}`);
            balanceMonitor.start();
            resolve(server);
        });
    });
};

if (require.main === module) {
    startServer(port);
}

module.exports = { app, startServer, balanceMonitor, server };
