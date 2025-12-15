# TODO: Gasless Onboarding Relayer (Refined)

This file breaks down the refined plan into actionable implementation tasks.

## Phase 1: Prototype Relayer

*   `[backend]` `[setup]` Initialize Node.js project and create `package.json` (`npm init -y`).
*   `[backend]` `[setup]` Install dependencies: `express`, `@solana/web3.js`, `bs58`, `dotenv`. (Parallel)
*   `[backend]` `[setup]` Create `index.js`, `.env`, and `.gitignore` files.
*   `[backend]` `[config]` Generate a server keypair and add its private key to the `.env` file.
*   `[backend]` `[config]` In `index.js`, implement the logic to load the server keypair from the `.env` file.
*   `[backend]` `[api]` Set up the basic Express server and define the `POST /relay` endpoint.
*   `[backend]` `[api]` In the `/relay` endpoint, implement the logic to decode and deserialize the transaction from a base64 string.
*   `[backend]` `[api]` Add logic to verify the transaction's client-side signature.
*   `[backend]` `[api]` Add logic to set the server as `feePayer` and `partialSign` the transaction.
*   `[backend]` `[api]` Add the final logic to serialize and send the transaction to the Solana devnet.
*   `[client]` `[script]` Create a `client-example/send-tx.js` script. (Parallel with backend work)
*   `[client]` `[script]` Implement logic to create, sign, and serialize a sample transaction.
*   `[client]` `[script]` Add logic to send the serialized transaction to the `/relay` endpoint and log the result.

## Phase 2: UX & Security

*   `[backend]` `[security]` Install `express-rate-limit`.
*   `[backend]` `[security]` Configure and apply a general rate limit to all routes.
*   `[backend]` `[security]` Configure and apply a stricter rate limit to the security and relay endpoints.
*   `[backend]` `[security]` `[api]` Create the `GET /challenge` endpoint to generate and manage nonces.
*   `[backend]` `[security]` `[api]` Create the `POST /verify` endpoint to verify the client's signed nonce.
*   `[backend]` `[security]` Install `jsonwebtoken`.
*   `[backend]` `[security]` In the `/verify` endpoint, issue a JWT upon successful verification.
*   `[backend]` `[security]` `[middleware]` Create a middleware function to protect routes by verifying JWTs.
*   `[backend]` `[security]` Apply the JWT middleware to the `/relay` endpoint.
*   `[backend]` `[observability]` Install a logging library (e.g., `winston`).
*   `[backend]` `[observability]` Add structured logging to all API endpoints.

## Phase 3: Sponsored Flows

*   `[backend]` `[rules]` Design and implement the sponsorship rules engine module.
*   `[backend]` `[rules]` Integrate the rules engine into the `/relay` endpoint, before the transaction is signed by the server.
*   `[backend]` `[rules]` Implement the "first N transactions" rule using an in-memory store.
*   `[backend]` `[rules]` Implement the "onboarding tasks" rule by inspecting transaction instruction data.

## Phase 4: Documentation & Testing

*   `[documentation]` Create a `README.md` file with initial setup instructions. (Can be started at any time)
*   `[documentation]` Document all API endpoints (`/challenge`, `/verify`, `/relay`) in the `README.md`.
*   `[test]` `[setup]` Install and configure a testing framework like Jest.
*   `[test]` Write unit tests for the sponsorship rules engine.
*   `[test]` Write unit tests for the signing challenge (`/challenge`, `/verify`) logic.
*   `[test]` Write integration tests for the complete end-to-end flow (challenge -> verify -> relay).
*   `[test]` `[debug]` Diagnose 500 Internal Server Error on `/relay` endpoint in `e2e.test.js`.