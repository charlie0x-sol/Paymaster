const winston = require('winston');
const { redactSecrets } = require('./logger');

describe('Logger Redaction', () => {
  it('should redact sensitive keys', () => {
    const sensitiveData = {
      level: 'info',
      message: 'Sensitive Info',
      privateKey: 'super-secret-key',
      token: 'jwt-token-123',
      nested: {
        secret: 'hidden-secret',
        public: 'visible',
      },
    };

    // Instantiate the format
    const format = redactSecrets();
    
    // Transform the data
    const result = format.transform(sensitiveData);

    expect(result.privateKey).toBe('***REDACTED***');
    expect(result.token).toBe('***REDACTED***');
    expect(result.nested.secret).toBe('***REDACTED***');
    expect(result.nested.public).toBe('visible');
    expect(result.message).toBe('Sensitive Info');
  });
});
