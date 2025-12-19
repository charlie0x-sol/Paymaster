# Solana Paymaster: A Gasless Transaction Relayer

Solana Paymaster is a gasless transaction relayer that sponsors transactions for users on the Solana blockchain. This allows new users to interact with your application without needing to have SOL for transaction fees, reducing friction and improving the onboarding experience.

This relayer is designed to be a flexible and robust solution that can be customized to fit your application's specific needs.

## Features

*   **Gasless Transactions:** Sponsors transactions for users, eliminating the need for them to have SOL.
*   **Customizable Rules Engine:** A flexible rules engine (`rules.js`) to control which transactions are sponsored.
*   **Rate Limiting:** Protects the relayer from abuse with IP-based rate limiting.
*   **Authentication:** A challenge-response mechanism ensures that only authorized users can use the relayer.
*   **Key Rotation:** Supports primary and secondary signing keys for seamless key rotation.
*   **Metrics and Monitoring:** Exposes a `/metrics` endpoint for Prometheus scraping, and includes a balance monitor for the relayer's wallet.
*   **Reliable Transaction Sender:** Enhanced delivery system with aggressive rebroadcasting (every 2s) to ensure transactions land during congestion.
*   **Dynamic Fee Estimation:** Built-in intelligence to recommend priority fees based on real-time network activity.
*   **Smart Client SDK:** Includes a robust wrapper (`SmartClient.js`) that handles authentication, fee management, and automatic retries for you.
*   **Containerized:** Ships with a `Dockerfile` and `docker-compose.yml` for easy deployment.

## Getting Started

Follow these steps to get the relayer running locally:

### 1. Installation

```bash
git clone <repository-url>
cd Paymaster
npm install
```

### 2. Configuration

1.  **Copy the example environment file:**
    ```bash
    cp .env.example .env
    ```

2.  **Generate a Relay Wallet:**
    Run the helper script to generate a new keypair. This will output a Hex string.
    ```bash
    node generateKeypair.js
    ```
    *Copy the `Private Key (Hex)` output and paste it into your `.env` file as `SERVER_PRIVATE_KEY`.*

3.  **Fund the Wallet:**
    The generated wallet needs SOL to pay for transaction fees. Copy the **Public Key** from the output above and fund it using a faucet (e.g., [Solana Faucet](https://faucet.solana.com/)) or transfer devnet SOL to it.

4.  **Set JWT Secret:**
    Update `JWT_SECRET` in `.env` to a secure random string.

### 3. Run the Server

```bash
# Ensure you have a Redis instance running (e.g., via docker-compose up -d redis)
npm start
```
*Note: You need a running Redis instance. You can use `docker-compose up -d` to start everything including Redis.*

### 4. Run the Live Demo

We provide a self-contained demo script that spins up the server and simulates a client interaction (authenticating and sending sponsored transactions).

```bash
node run_demo.js
```

### 5. Client Example

You can find a standalone client example in the `client-example/` directory.

```bash
cd client-example
node send-tx.js
```

## Configuration

The relayer is configured using environment variables. The following variables are available:

| Variable                  | Description                                                                                                                               | Default   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `PORT`                    | The port for the server to listen on.                                                                                                     | `3000`    |
| `SOLANA_NETWORK`          | The Solana network to connect to. Can be `devnet`, `testnet`, or `mainnet-beta`.                                                          | `devnet`  |
| `SERVER_PRIVATE_KEY`      | The secret key of the primary fee-paying wallet, encoded in hex. **This is a sensitive value and should be handled with care.**              | (required)|
| `SERVER_PRIVATE_KEY_OLD`  | The secret key of the secondary fee-paying wallet for key rotation, encoded in hex.                                                       | (optional)|
| `JWT_SECRET`              | A secret string for signing and verifying JSON Web Tokens (JWTs).                                                                         | (required)|
| `ALLOWED_ORIGINS`         | A comma-separated list of origins to allow for CORS. Use `*` to allow all origins.                                                         | `*`       |
| `REDIS_URL`               | The URL for the Redis instance (e.g., `redis://localhost:6379`).                                                                          | (required)|

### Private Key Management

The `SERVER_PRIVATE_KEY` and `SERVER_PRIVATE_KEY_OLD` are highly sensitive. **Do not commit them to version control.**

For local development, you can store them in the `.env` file. For production, it is strongly recommended to use a secret management service like AWS Secrets Manager, Google Secret Manager, or HashiCorp Vault.

## API Reference

### `GET /challenge`

Generates a unique nonce for the client to sign. This is the first step in the authentication process.

*   **Response:**
    ```json
    {
      "nonce": "a1b2c3d4...",
      "relayerPublicKey": "..."
    }
    ```

### `GET /fees`

Fetches recommended priority fees and a fresh blockhash from the relayer's perspective. Use this to ensure your transaction is landable.

*   **Response:**
    ```json
    {
      "priorityFee": 11000,
      "blockhash": "...",
      "lastValidBlockHeight": 123456
    }
    ```

### `POST /verify`

Verifies the client's signature of the nonce and returns a JWT for use with the `/relay` endpoint.

*   **Request Body:**
    ```json
    {
      "nonce": "a1b2c3d4...",
      "publicKey": "...",
      "signature": "..."
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "token": "..."
    }
    ```

### `POST /relay`

Relays a transaction to the configured Solana network.

*   **Authorization:** `Bearer <token>` (the JWT from `/verify`)
*   **Request Body:**
    ```json
    {
      "transaction": "<base64-encoded transaction>"
    }
    ```
*   **Response (Success):**
    ```json
    {
      "success": true,
      "signature": "..."
    }
    ```
*   **Response (Error):**
    ```json
    {
      "error": "...",
      "details": "..."
    }
    ```

## Deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

This project includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

To build and run the Docker container:

1.  **Build the image:**
    ```bash
    docker build -t paymaster .
    ```

2.  **Run the container:**
    ```bash
    docker run -p 3000:3000 --env-file .env paymaster
    ```

You can also use the `docker-compose.yml` file to run the relayer and a Redis instance together:

```bash
docker-compose up
```

Make sure your `.env` file is configured correctly before running `docker-compose up`.

## Contributing

Contributions are welcome! If you have a feature request, bug report, or want to contribute to the code, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.