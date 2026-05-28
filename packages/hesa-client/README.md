# @hesa/client

Tiny JavaScript client for the Hedera Enterprise Settlement Agent (HESA) API.

## Install

```bash
npm install @hesa/client
```

## Usage

```js
import { createHesaClient } from "@hesa/client";

const hesa = createHesaClient({
  baseUrl: "https://hesa-agent-production.up.railway.app",
  // apiKey: "optional-if-backend-auth-enabled",
});

const health = await hesa.health();
const result = await hesa.run({
  prompt:
    "Run KYC for Acme Corp in UG, draft invoice for 1 HBAR due today, transfer 1 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt message with invoice details.",
});

console.log(health, result);
```
