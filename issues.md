# Issues Log

## 1. Environment Variable Loading
- **Issue**: Server failed to start with "bad secret key size" error.
- **Investigation**: 
    - `SERVER_PRIVATE_KEY` in `.env` is 128 hex characters (64 bytes).
    - `Buffer.from(..., 'hex').length` confirms 64 bytes.
    - `web3.Keypair.fromSecretKey` expects a 64-byte Uint8Array (or Buffer).
- **Hypothesis**: There might be hidden characters in the `.env` file or `dotenv` parsing issue.

## 2. PublicKey Instantiation
- **Issue**: `fund_paymaster.js` failed with `TypeError: Class constructor PublicKey cannot be invoked without 'new'`.
- **Fix**: Corrected the import and instantiation of `PublicKey`.

## 3. Docker/System Constraints
- **Issue**: `ps aux` failed due to missing `/proc` mount.
- **Workaround**: Relying on direct process management and logs.
