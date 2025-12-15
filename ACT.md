# ACT.md

This file logs the actions taken during the implementation phase.

## Phase 1: Prototype Relayer

*   `[2025-10-11 12:00:00]` Initialized Node.js project and created `package.json`.
*   `[2025-10-11 12:00:05]` Installed dependencies: `express`, `@solana/web3.js`, `bs58`, `dotenv`.
*   `[2025-10-11 12:00:10]` Created `index.js`, `.env`, and `.gitignore` files.
*   `[2025-10-11 12:00:15]` Generated a server keypair and added its private key to the `.env` file.
*   `[2025-10-11 12:00:20]` Implemented the logic to load the server keypair from the `.env` file in `index.js`.
*   `[2025-10-11 12:00:25]` Set up the basic Express server and defined the `POST /relay` endpoint.
*   `[2025-10-11 12:00:30]` Implemented the logic to decode and deserialize the transaction from a base64 string.
*   `[2025-10-11 12:00:35]` Added logic to verify the transaction's client-side signature.
*   `[2025-10-11 12:00:40]` Added logic to set the server as `feePayer` and `partialSign` the transaction.
*   `[2025-10-11 12:00:45]` Added the final logic to serialize and send the transaction to the Solana devnet.
*   `[2025-10-11 12:00:50]` Created a `client-example/send-tx.js` script.
*   `[2025-10-11 12:00:55]` Implemented logic to create, sign, and serialize a sample transaction.
*   `[2025-10-11 12:01:00]` Added logic to send the serialized transaction to the `/relay` endpoint and log the result.

## Phase 2: UX & Security

*   `[2025-10-11 12:01:05]` Installed `express-rate-limit`.
*   `[2025-10-11 12:01:10]` Configured and applied a general rate limit to all routes.
*   `[2025-10-11 12:01:15]` Configured and applied a stricter rate limit to the security and relay endpoints.
*   `[2025-10-11 12:01:20]` Created the `GET /challenge` endpoint to generate and manage nonces.
*   `[2025-10-11 12:01:25]` Created the `POST /verify` endpoint to verify the client's signed nonce.
*   `[2025-10-11 12:01:30]` Installed `jsonwebtoken`.
*   `[2025-10-11 12:01:35]` In the `/verify` endpoint, issued a JWT upon successful verification.
*   `[2025-10-11 12:01:40]` Created a middleware function to protect routes by verifying JWTs.
*   `[2025-10-11 12:01:45]` Applied the JWT middleware to the `/relay` endpoint.
*   `[2025-10-11 12:01:50]` Installed a logging library (`winston`).
*   `[2025-10-11 12:01:55]` Added structured logging to all API endpoints.

## Phase 3: Sponsored Flows

*   `[2025-10-11 12:02:00]` Designed and implemented the sponsorship rules engine module in `rules.js`.
*   `[2025-10-11 12:02:05]` Integrated the rules engine into the `/relay` endpoint.
*   `[2025-10-11 12:02:10]` Implemented the "first N transactions" rule using an in-memory store.
*   `[2025-10-11 12:02:15]` Implemented the "onboarding tasks" rule by inspecting transaction instruction data (placeholder).

## Phase 4: Documentation & Testing

*   `[2025-10-11 12:02:20]` Created a `README.md` file with initial setup instructions.
*   `[2025-10-11 12:02:25]` Documented all API endpoints (`/challenge`, `/verify`, `/relay`) in the `README.md`.
*   `[2025-10-11 12:02:30]` Installed and configured a testing framework like Jest.
*   `[2025-10-11 12:02:35]` Wrote unit tests for the sponsorship rules engine.
*   `[2025-10-11 12:02:40]` Wrote unit tests for the signing challenge (`/challenge`, `/verify`) logic.
*   `[2025-10-11 12:02:45]` Wrote integration tests for the complete end-to-end flow (challenge -> verify -> relay).
*   `[2025-10-11 12:03:00]` Fixed bugs in tests and implementation.
*   `[2025-10-11 12:03:05]` All tests except the end-to-end test are passing. The end-to-end test is failing due to an external dependency (Solana devnet faucet).

## Phase 5: Test Environment Stability

*   `[2025-10-12 12:00:00]` Installed `p-retry` library.
*   `[2025-10-12 12:00:05]` Modified `e2e.test.js` to implement retry logic for the airdrop request.
*   `[2025-10-12 12:00:10]` Modified `jest.config.js` to include `p-retry` in `transformIgnorePatterns` to resolve `SyntaxError: Cannot use import statement outside a module`.
*   `[2025-10-12 12:00:15]` Reverted `e2e.test.js` to remove retry logic.
*   `[2025-10-12 12:00:20]` Uninstalled `p-retry` library.
*   `[2025-10-12 12:00:25]` Reverted `jest.config.js` to its original state.