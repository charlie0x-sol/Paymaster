"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.balanceMonitor = exports.startServer = exports.app = void 0;
console.log('Starting server...');
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Fix: Import redisClient first to avoid potential dependency conflicts/hanging
const redisClient_1 = __importDefault(require("./redisClient"));
const express_1 = __importDefault(require("express"));
const web3 = __importStar(require("@solana/web3.js"));
const bs58_1 = __importDefault(require("bs58"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const cors_1 = __importDefault(require("cors"));
const rules_1 = __importDefault(require("./rules"));
const metrics_1 = require("./metrics");
const monitor_1 = __importDefault(require("./monitor"));
const logger_1 = require("./logger");
const fees_1 = require("./fees");
const transactionSender_1 = require("./transactionSender");
const app = (0, express_1.default)();
exports.app = app;
// Trust proxy for rate limiting behind Render's load balancer
// See https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', process.env.TRUST_PROXY || 1);
// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
if (!process.env.ALLOWED_ORIGINS) {
    logger_1.logger.warn('ALLOWED_ORIGINS not set. Defaulting to "*" (all origins). This is insecure for production.');
}
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    optionsSuccessStatus: 200
}));
app.use(express_1.default.json());
// Connect to Redis
(async () => {
    console.log('Connecting to Redis...');
    try {
        await redisClient_1.default.connect();
        console.log('Connected to Redis successfully.');
    }
    catch (e) {
        console.error('Failed to connect to Redis', { error: e.message });
        logger_1.logger.error('Failed to connect to Redis', { error: e.message });
        process.exit(1); // Exit if Redis fails
    }
})();
// Debug Environment Variables
console.log('DEBUG: Environment Variables Keys:', Object.keys(process.env));
if (process.env.SERVER_PRIVATE_KEY) {
    console.log(`DEBUG: SERVER_PRIVATE_KEY length: ${process.env.SERVER_PRIVATE_KEY.length}`);
}
else {
    console.log('DEBUG: SERVER_PRIVATE_KEY is MISSING from process.env');
}
// General rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    store: new rate_limit_redis_1.RedisStore({
        sendCommand: (...args) => redisClient_1.default.sendCommand(args),
        prefix: 'rl:global:',
    }),
});
app.use(limiter);
// Stricter rate limiting for security and relay endpoints
const strictLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    store: new rate_limit_redis_1.RedisStore({
        sendCommand: (...args) => redisClient_1.default.sendCommand(args),
        prefix: 'rl:strict:',
    }),
});
console.log('Loading keypairs...');
const keypairs = [];
if (process.env.SERVER_PRIVATE_KEY) {
    console.log('Loading SERVER_PRIVATE_KEY...');
    try {
        const secretKeyBuffer = Buffer.from(process.env.SERVER_PRIVATE_KEY, 'hex');
        console.log(`DEBUG: Secret Key Buffer Length: ${secretKeyBuffer.length}`);
        keypairs.push(web3.Keypair.fromSecretKey(secretKeyBuffer));
        console.log('SERVER_PRIVATE_KEY loaded successfully.');
    }
    catch (e) {
        console.error('Failed to load SERVER_PRIVATE_KEY', { error: e.message });
        logger_1.logger.error('Failed to load SERVER_PRIVATE_KEY', { error: e.message });
    }
}
if (process.env.SERVER_PRIVATE_KEY_OLD) {
    console.log('Loading SERVER_PRIVATE_KEY_OLD...');
    try {
        keypairs.push(web3.Keypair.fromSecretKey(Buffer.from(process.env.SERVER_PRIVATE_KEY_OLD, 'hex')));
        console.log('SERVER_PRIVATE_KEY_OLD loaded successfully.');
    }
    catch (e) {
        console.error('Failed to load SERVER_PRIVATE_KEY_OLD', { error: e.message });
        logger_1.logger.error('Failed to load SERVER_PRIVATE_KEY_OLD', { error: e.message });
    }
}
console.log('Keypairs loaded:', keypairs.length);
if (keypairs.length === 0) {
    console.error('No server private keys found! Exiting...');
    logger_1.logger.error('No server private keys found! Exiting...');
    process.exit(1);
}
const primaryKeypair = keypairs[0];
const jwtSecret = process.env.JWT_SECRET || 'default_secret'; // Fallback for types, but verified logic ensures it's set usually
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jsonwebtoken_1.default.verify(token, jwtSecret, (err, user) => {
            if (err) {
                logger_1.logger.error('JWT verification failed', { error: err });
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    }
    else {
        res.sendStatus(401);
    }
};
const solanaNetwork = process.env.SOLANA_NETWORK || 'devnet';
const connection = new web3.Connection(web3.clusterApiUrl(solanaNetwork));
// Start Balance Monitor (Monitor primary key)
const balanceMonitor = new monitor_1.default(connection, primaryKeypair.publicKey);
exports.balanceMonitor = balanceMonitor;
// Don't start it immediately in test mode usually.
// We can handle cleanup in exports.
const feeEstimator = new fees_1.FeeEstimator(connection);
const transactionSender = new transactionSender_1.TransactionSender(connection);
app.get('/', (req, res) => {
    res.send({
        service: 'paymaster-relayer',
        status: 'running',
        relayerPublicKey: primaryKeypair.publicKey.toBase58(),
    });
});
app.get('/fees', async (req, res) => {
    try {
        const priorityFee = await feeEstimator.getPriorityFeeEstimate();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        res.send({
            priorityFee,
            blockhash,
            lastValidBlockHeight
        });
    }
    catch (e) {
        logger_1.logger.error('Error in /fees', { error: e.message });
        res.status(500).send('Error fetching fee data');
    }
});
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', metrics_1.register.contentType);
        res.end(await metrics_1.register.metrics());
    }
    catch (ex) {
        res.status(500).send(ex);
    }
});
app.get('/challenge', strictLimiter, async (req, res) => {
    logger_1.logger.info('GET /challenge');
    const nonce = crypto_1.default.randomBytes(16).toString('hex');
    // Store nonce with 5 minutes expiration
    await redisClient_1.default.set(nonce, 'true', { PX: 5 * 60 * 1000 });
    res.send({ nonce, relayerPublicKey: primaryKeypair.publicKey.toBase58() });
});
app.post('/verify', strictLimiter, async (req, res) => {
    logger_1.logger.info('POST /verify');
    const { nonce, publicKey, signature } = req.body;
    const storedNonce = await redisClient_1.default.get(nonce);
    if (!storedNonce) {
        logger_1.logger.warn('Invalid or expired nonce', { nonce });
        return res.status(400).send('Invalid or expired nonce');
    }
    const message = new TextEncoder().encode(nonce);
    const signatureBytes = bs58_1.default.decode(signature);
    const publicKeyBytes = bs58_1.default.decode(publicKey);
    if (!tweetnacl_1.default.sign.detached.verify(message, signatureBytes, publicKeyBytes)) {
        logger_1.logger.warn('Invalid signature for nonce', { nonce, publicKey });
        return res.status(400).send('Invalid signature');
    }
    await redisClient_1.default.del(nonce);
    const token = jsonwebtoken_1.default.sign({ publicKey }, jwtSecret, { expiresIn: '15m' });
    logger_1.logger.info('Verification successful, JWT issued', { publicKey });
    res.send({ success: true, token });
});
app.post('/relay', strictLimiter, authenticateJWT, async (req, res) => {
    logger_1.logger.info('POST /relay', { publicKey: req.user.publicKey });
    try {
        const { transaction, lastValidBlockHeight } = req.body;
        if (!transaction) {
            logger_1.logger.warn('Invalid relay request: missing transaction');
            metrics_1.relayFailureCounter.inc({ error_type: 'missing_transaction' });
            return res.status(400).send('Invalid request');
        }
        const txBuffer = Buffer.from(transaction, 'base64');
        logger_1.logger.info('Deserializing transaction');
        const tx = web3.Transaction.from(txBuffer);
        logger_1.logger.info('Checking rules');
        // Await the async rules engine check
        const isSponsored = await rules_1.default.isSponsored(connection, tx, req.user.publicKey);
        if (!isSponsored) {
            logger_1.logger.warn('Transaction not eligible for sponsorship', { publicKey: req.user.publicKey });
            metrics_1.relayFailureCounter.inc({ error_type: 'not_sponsored' });
            return res.status(403).send('Transaction not sponsored');
        }
        // Identify which keypair is the fee payer
        const signingKeypair = keypairs.find(kp => tx.feePayer && tx.feePayer.equals(kp.publicKey));
        if (!signingKeypair) {
            logger_1.logger.warn('Invalid fee payer', { feePayer: tx.feePayer ? tx.feePayer.toBase58() : 'undefined', expected: keypairs.map(k => k.publicKey.toBase58()) });
            metrics_1.relayFailureCounter.inc({ error_type: 'invalid_fee_payer' });
            return res.status(400).send('Invalid fee payer');
        }
        logger_1.logger.info('Signing transaction', { feePayer: signingKeypair.publicKey.toBase58() });
        try {
            tx.partialSign(signingKeypair);
            logger_1.logger.info('Partially signed');
        }
        catch (e) {
            logger_1.logger.error('Partial sign failed', { message: e.message, stack: e.stack });
            metrics_1.relayFailureCounter.inc({ error_type: 'signing_failed' });
            throw e;
        }
        logger_1.logger.info('Verifying signatures');
        if (!tx.verifySignatures()) {
            logger_1.logger.warn('Invalid transaction signature', { publicKey: req.user.publicKey });
            metrics_1.relayFailureCounter.inc({ error_type: 'invalid_signature' });
            return res.status(400).send('Invalid signature');
        }
        logger_1.logger.info('Simulating transaction');
        const simulationResult = await connection.simulateTransaction(tx);
        if (simulationResult.value.err) {
            logger_1.logger.warn('Transaction simulation failed', { err: simulationResult.value.err, logs: simulationResult.value.logs });
            metrics_1.relayFailureCounter.inc({ error_type: 'simulation_failed' });
            return res.status(400).send({ error: 'Transaction simulation failed', details: simulationResult.value.err, logs: simulationResult.value.logs });
        }
        let serializedTx;
        try {
            serializedTx = tx.serialize();
            logger_1.logger.info('Serialized transaction');
        }
        catch (e) {
            logger_1.logger.error('Serialization failed', { message: e.message, stack: e.stack });
            metrics_1.relayFailureCounter.inc({ error_type: 'serialization_failed' });
            throw e;
        }
        logger_1.logger.info('Sending transaction via robust sender');
        // Use provided lastValidBlockHeight or fetch current
        let lvbh = lastValidBlockHeight;
        if (!lvbh) {
            const latest = await connection.getLatestBlockhash();
            lvbh = latest.lastValidBlockHeight;
        }
        const signature = await transactionSender.sendAndConfirm(serializedTx, {
            blockhash: tx.recentBlockhash,
            lastValidBlockHeight: lvbh
        });
        logger_1.logger.info('Transaction relayed successfully', { signature });
        metrics_1.relaySuccessCounter.inc();
        res.send({ success: true, signature });
    }
    catch (error) {
        logger_1.logger.error('Error relaying transaction', { message: error.message, stack: error.stack });
        metrics_1.relayFailureCounter.inc({ error_type: 'relay_execution_error' });
        res.status(500).send('Internal server error');
    }
});
const port = process.env.PORT || 3000;
let server;
const startServer = (portToUse) => {
    return new Promise((resolve) => {
        exports.server = server = app.listen(portToUse, () => {
            logger_1.logger.info(`Server is running on port ${portToUse}`);
            balanceMonitor.start();
            resolve(server);
        });
        server.setTimeout(30000); // 30 seconds timeout
        server.keepAliveTimeout = 30000;
        server.headersTimeout = 31000;
    });
};
exports.startServer = startServer;
if (require.main === module) {
    console.log('Starting server...');
    startServer(port);
}
