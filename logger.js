const winston = require('winston');

// List of keys to redact
const SENSITIVE_KEYS = ['privateKey', 'secret', 'token', 'authorization', 'signature'];

// Custom format to redact sensitive data
const redactSecrets = winston.format((info) => {
  const redact = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        redact(obj[key]);
      } else if (SENSITIVE_KEYS.includes(key)) {
        obj[key] = '***REDACTED***';
      }
    }
  };
  
  // Clone info to avoid mutating original objects if used elsewhere
  const infoClone = JSON.parse(JSON.stringify(info));
  redact(infoClone);
  return infoClone;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    redactSecrets(),
    winston.format.json()
  ),
  defaultMeta: { service: 'paymaster-relayer' },
  transports: [
    new winston.transports.Console(),
    // In a real production env, you might add:
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'combined.log' }),
    // Or a dedicated HTTP transport for Datadog/Splunk:
    // new require('winston-datadog-logs-transport')({ ... })
  ],
});

module.exports = { logger, redactSecrets };
