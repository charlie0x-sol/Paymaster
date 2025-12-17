import { redactSecrets } from './src/logger';
import winston from 'winston';

describe('Logger Redaction', () => {
  it('should redact sensitive keys', () => {
    const sensitiveData = {
      user: 'alice',
      privateKey: 'super-secret-key',
      nested: {
        token: 'jwt-token',
        public: 'visible'
      }
    };

    // Since redactSecrets is a winston format, we need to wrap it or test the logic
    // The format returns a new Format object with a transform method.
    // However, looking at the code: 
    // const redactSecrets = winston.format((info) => { ... })
    // calling redactSecrets() returns the Format.
    
    const format = redactSecrets();
    // @ts-ignore - winston types make this tricky to test directly without a full logger
    const result = format.transform(sensitiveData, { level: 'info', message: 'test' });
    
    // Check type assertion if result is boolean or object. It returns info object.
    const resultObj = result as any;

    expect(resultObj.user).toBe('alice');
    expect(resultObj.privateKey).toBe('***REDACTED***');
    expect(resultObj.nested.token).toBe('***REDACTED***');
    expect(resultObj.nested.public).toBe('visible');
  });
});