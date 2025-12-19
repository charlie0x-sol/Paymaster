# Reliable Transaction Sender Plan

This plan outlines the extension of the Paymaster Relayer to improve transaction success rates to 99%+ through dynamic fee estimation, aggressive rebroadcasting, and smart client-side logic.

## 1. Backend: Fee Intelligence
**Goal:** Provide clients with accurate, real-time data to build landable transactions.

- **`src/fees.ts`**: Implement a `FeeEstimator` class that fetches `getRecentPrioritizationFees` and calculates the 75th percentile (with a buffer) to ensure priority.
- **`GET /fees` Endpoint**: Expose an endpoint in `src/index.ts` that returns:
  - `recommendedPriorityFee` (in microLamports)
  - `blockhash`
  - `lastValidBlockHeight`

## 2. Backend: Robust Delivery ("The Muscle")
**Goal:** Ensure a signed transaction lands on-chain even during network congestion.

- **`src/transactionSender.ts`**:
  - **Aggressive Rebroadcasting**: A custom loop that sends the transaction every 2 seconds until it is either confirmed or the blockhash expires.
  - **Jito Support**: Optional bundling via Jito Block Engine for guaranteed landing and MEV protection.
- **Relay Integration**: Update the `/relay` endpoint in `src/index.ts` to use this robust sender instead of the default `sendAndConfirmRawTransaction`.

## 3. Client: Smart Wrapper Library ("The Agent")
**Goal:** A client-side SDK that handles the "expired blockhash" and "low fee" retry loops automatically.

- **`client-example/SmartClient.js`**:
  - `createAndSend(instructions, signer)`:
    1. Fetches recommended fees and blockhash from `/fees`.
    2. Adds `ComputeBudgetProgram.setComputeUnitPrice`.
    3. Signs and submits to `/relay`.
    4. **Auto-Retry**: If the relayer reports an expired blockhash or dropped transaction, the client automatically fetches a new blockhash, re-signs, and retries without user intervention.

## 4. Implementation Schedule

1. [ ] **Phase 1**: Implement `src/fees.ts` and `/fees` endpoint.
2. [ ] **Phase 2**: Implement `src/transactionSender.ts` and integrate with `/relay`.
3. [ ] **Phase 3**: Develop `SmartClient.js` and update `send-tx.js` for verification.
4. [ ] **Phase 4**: Load testing and performance tuning.

## 5. Technical Details
- **Low-Cost Angle**: By using the 75th percentile of recent fees, we avoid overpaying (like some "High Priority" settings in wallets) while staying ahead of the median "spam" traffic.
- **Gasless Sponsorship**: Integrated directly with existing Paymaster rules.
