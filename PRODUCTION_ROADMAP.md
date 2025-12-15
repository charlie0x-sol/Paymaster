# Production Readiness Roadmap

This document outlines the necessary phases and tasks to transition the Gasless Onboarding Relayer from a functional prototype to a robust, production-ready system.

## Phase 1: Persistence & Scalability
*Goal: Remove reliance on server memory to allow restarts and horizontal scaling.*

- [x] **Redis Integration for Nonces:** 
    - Replace the in-memory `nonces` object with Redis.
    - Use Redis TTL (Time-To-Live) features to automatically handle nonce expiration.
- [x] **Database for Usage Tracking:**
    - Migrate `rulesEngine.transactionCounts` to a persistent database (PostgreSQL or Redis).
    - Schema should support tracking usage by `publicKey` with timestamps to allow for "daily limits" or "total lifetime limits".
- [x] **Distributed Rate Limiting:**
    - Configure `express-rate-limit` to use a Redis store so rate limits apply across multiple server instances.

## Phase 2: Enhanced Rules Engine
*Goal: Ensure sponsorship is strictly targeted at valid onboarding activities.*

- [x] **Instruction Parsing:**
    - Implement deep inspection of `transaction.instructions` in `rules.js`.
    - Decode instruction data to verify it interacts with specific Program IDs (e.g., specific DeFi protocols or NFT minting contracts).
- [x] **Allowlists:**
    - Create a configuration file or DB table for "Whitelisted Program IDs".
    - Create a "Blacklist" for suspicious accounts or contracts.
- [x] **Dynamic Limits:**
    - Implement limits based on gas costs (e.g., "Sponsor up to 0.005 SOL per user").

## Phase 3: Infrastructure & Monitoring
*Goal: Ensure high availability and proactive issue detection.*

- [x] **Wallet Balance Monitoring:**
    - Create a background service/cron job that checks the Relayer's SOL balance every minute.
    - Integration with alerting tools (Slack/PagerDuty/Email) to warn when funds drop below a threshold (e.g., 1 SOL).
- [x] **Structured Logging & Aggregation:**
    - Configure `winston` to ship logs to a centralized aggregator (Datadog, ELK Stack, or CloudWatch).
    - Ensure sensitive data (like full Request Bodies containing private details, though unlikely here) is redacted.
- [x] **Metrics Dashboard:**
    - Expose metrics (Prometheus endpoint) for:
        - Successful relays.
        - Failed relays (grouped by error type).
        - Average latency.
        - Relayer wallet balance.

## Phase 4: Security Hardening
*Goal: Protect the relayer funds and infrastructure.*

- [x] **Secrets Management:**
    - Move `SERVER_PRIVATE_KEY` and `JWT_SECRET` out of `.env` files.
    - Use a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, or Google Secret Manager).
- [x] **Key Rotation:**
    - Implement a strategy for rotating the Relayer's keypair without downtime.
- [x] **Transaction Simulation:**
    - Before signing, simulate the transaction using `connection.simulateTransaction()`.
    - Reject transactions that are predicted to fail to save on fees and reduce network noise.
- [x] **Strict CORS & Firewall:**
    - Configure CORS to only allow requests from your specific frontend domains.
    - Set up a WAF (Web Application Firewall) to block malicious traffic patterns.

## Phase 5: Deployment & CI/CD
*Goal: Automate delivery and ensure consistent environments.*

- [x] **Containerization:**
    - Create a `Dockerfile` for the application.
    - Use multi-stage builds to keep the image size small.
- [x] **CI/CD Pipeline:**
    - Set up GitHub Actions (or similar) to run tests (`npm test`) on every commit.
    - Automate deployment to staging/production environments on merge.
- [x] **Load Balancing:**
    - Deploy multiple instances behind a load balancer (Nginx/AWS ALB) to handle high traffic.
