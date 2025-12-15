# Gasless Onboarding Relayer

This project is a gasless onboarding relayer for Solana. It allows new users to have their first few transactions sponsored by a relayer, so they don't need to have SOL to get started.

## Setup

1.  Clone the repository.
2.  Run `npm install` to install the dependencies.
3.  Create a `.env` file and add the following variables:
    *   `SERVER_PRIVATE_KEY`: The private key of the relayer's keypair.
    *   `JWT_SECRET`: A secret for signing JWTs.
4.  Run `npm start` to start the server.

## API Endpoints

### GET /challenge

*   **Description:** Generates a unique nonce for the client to sign.
*   **Response:**
    ```json
    {
      "nonce": "a1b2c3d4..."
    }
    ```

### POST /verify

*   **Description:** Verifies the client's signature of the nonce and returns a JWT.
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

### POST /relay

*   **Description:** Relays a transaction to the Solana devnet.
*   **Authorization:** `Bearer <token>`
*   **Request Body:**
    ```json
    {
      "transaction": "..."
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "signature": "..."
    }
    ```
