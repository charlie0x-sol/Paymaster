# Plan: Gasless Onboarding Relayer (Refined)

This refined plan incorporates technical decisions from the research phase to provide a more detailed roadmap for implementation.

## Phase 1: Prototype Relayer

The goal is to build a minimal, functional relayer using specific libraries and methods identified in research.

1.  **Project Setup:**
    *   Initialize a new Node.js project.
    *   Install dependencies: `@solana/web3.js`, `express`, `bs58`, and `dotenv`.
    *   Create a `.env` file to store the server's private key.
    *   Set up a basic Express server in `index.js`.
    *   Load the server keypair from the `.env` file using `dotenv`, `bs58`, and `Keypair.fromSecretKey()`.

2.  **Relayer Endpoint (`/relay`):**
    *   Create a POST endpoint that accepts a base64-encoded, serialized, and client-signed transaction.
    *   **Endpoint Logic:**
        *   Deserialize the transaction using `Transaction.from(Buffer.from(req.body.transaction, 'base64'))`.
        *   Verify the client's signature.
        *   Set the `feePayer` to the server's public key: `transaction.feePayer = serverKeypair.publicKey`.
        *   Partially sign the transaction with the server's key: `transaction.partialSign(serverKeypair)`.
        *   Serialize the final transaction and send it using `connection.sendRawTransaction()`.
        *   Return the resulting transaction signature.

3.  **Client-Side Script:**
    *   Create a simple Node.js script to simulate the client.
    *   The script will create and sign a transaction, leaving the `feePayer` undefined.
    *   It will then serialize the transaction, encode it in base64, and send it to the `/relay` endpoint.

## Phase 2: UX & Security

This phase implements specific security measures based on the research findings.

1.  **Rate Limiting:**
    *   Implement IP-based rate limiting on all endpoints using `express-rate-limit`.
    *   Apply a stricter limit specifically to the `/relay` and `/challenge` endpoints.

2.  **Anti-Bot: Signing Challenge:**
    *   Create a `/challenge` GET endpoint that generates a random nonce and stores it temporarily (e.g., in an in-memory map with an expiry).
    *   Create a `/verify` POST endpoint where the client sends their public key and a signature of the nonce.
    *   The server will verify the signature to prove the client owns the public key.

3.  **Session Management with JWT:**
    *   Install `jsonwebtoken`.
    *   Upon a successful verification at the `/verify` endpoint, issue a short-lived JWT.
    *   Create an authentication middleware that verifies the JWT on all calls to the `/relay` endpoint.

4.  **Monitoring & Analytics:**
    *   Integrate a logging library like `winston` or `pino` for structured logging of relayed transactions and security events.

## Phase 3: Sponsored Flows

This phase remains focused on business logic, but the implementation will be protected by the security measures from Phase 2.

1.  **Sponsorship Rules Engine:**
    *   Design and implement a flexible rules engine that inspects transaction instructions before the `feePayer` is added.
    *   If rules are not met, the transaction is rejected before being signed by the server.

2.  **Implement Sponsorship Rules:**
    *   **Rule 1: First N Transactions:** Sponsor the first 3 transactions for a new user (tracked by public key).
    *   **Rule 2: Onboarding Tasks:** Sponsor transactions only for specific program instructions.

## Phase 4: Documentation & Testing

1.  **Documentation:**
    *   Create a `README.md` with detailed setup instructions and API documentation for all endpoints (`/challenge`, `/verify`, `/relay`).
2.  **Testing:**
    *   Set up a testing framework like Jest.
    *   Write unit tests for the sponsorship rules engine and the signing challenge logic.
    *   Write integration tests for the full flow: challenge -> verify -> relay.

## Phase 5: Test Environment Stability

1.  **Diagnose 500 Internal Server Error on `/relay` endpoint:**
    *   Investigate server logs for the `Error relaying transaction` to identify the root cause.
    *   Examine the transaction structure being sent to the `/relay` endpoint in `e2e.test.js` to ensure it's valid.
    *   Check Solana devnet status and any recent changes that might affect transaction relaying.