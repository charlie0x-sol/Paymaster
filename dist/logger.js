"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSecrets = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
// List of keys to redact
const SENSITIVE_KEYS = ['privateKey', 'secret', 'token', 'authorization', 'signature'];
// Custom format to redact sensitive data
const redactSecrets = winston_1.default.format((info) => {
    const redact = (obj) => {
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                redact(obj[key]);
            }
            else if (SENSITIVE_KEYS.includes(key)) {
                obj[key] = '***REDACTED***';
            }
        }
    };
    // Clone info to avoid mutating original objects if used elsewhere
    const infoClone = JSON.parse(JSON.stringify(info));
    redact(infoClone);
    return infoClone;
});
exports.redactSecrets = redactSecrets;
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), redactSecrets(), winston_1.default.format.json()),
    defaultMeta: { service: 'paymaster-relayer' },
    transports: [
        new winston_1.default.transports.Console(),
        // In a real production env, you might add:
        // new winston.transports.File({ filename: 'error.log', level: 'error' }),
        // new winston.transports.File({ filename: 'combined.log' }),
        // Or a dedicated HTTP transport for Datadog/Splunk:
        // new require('winston-datadog-logs-transport')({ ... })
    ],
});
exports.logger = logger;
