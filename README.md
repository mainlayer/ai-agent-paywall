# AI Agent Paywall

A template for AI agents that sell their outputs on a pay-per-use basis via [Mainlayer](https://mainlayer.fr) — payment infrastructure for AI agents.

Clone this, replace the demo agent logic with your own, and you have a working paid AI API in minutes.

## What this template does

- Runs an Express HTTP server that exposes an AI agent as a paid API
- Verifies payment via Mainlayer before running the agent
- Returns `402 Payment Required` with machine-readable instructions when not paid
- Serves paying clients with the agent's output
- Includes an example of fully autonomous agent-to-agent payment

## Quick start

```bash
# 1. Clone and install
git clone <this-repo>
cd ai-agent-paywall
npm install

# 2. Configure environment
cp .env.example .env
# Add your MAINLAYER_API_KEY to .env (get one at https://dashboard.mainlayer.fr)

# 3. Register this agent on Mainlayer
npm run setup
# Copy the MAINLAYER_RESOURCE_ID it outputs into your .env

# 4. Start the server
npm start
```

```bash
# Verify it works
curl http://localhost:3000/health
curl http://localhost:3000/info
```

## Project structure

```
ai-agent-paywall/
├── src/
│   ├── index.ts       # HTTP server — routes, paywall wiring, error handling
│   ├── mainlayer.ts   # Mainlayer API client — auth, resources, entitlements
│   ├── paywall.ts     # Payment verification middleware
│   ├── agent.ts       # AI agent logic (REPLACE THIS with your own)
│   └── setup.ts       # One-time setup script
├── examples/
│   ├── call-agent.ts          # Client calling the paid agent
│   └── agent-calls-agent.ts   # Autonomous agent-to-agent transaction
├── .env.example
├── docker-compose.yml
└── Dockerfile
```

## How to replace the demo AI logic

Open `src/agent.ts`. The `runAgent` function is the only thing you need to change.

```typescript
// Current demo (src/agent.ts)
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const start = Date.now();
  return {
    result: `Summary of "${input.input.slice(0, 50)}..."`,
    latency_ms: Date.now() - start,
    model: 'demo-agent-v1',
  };
}

// Replace with an OpenAI call:
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: input.input }],
  });
  return {
    result: response.choices[0].message.content!,
    tokens_used: response.usage?.total_tokens,
    latency_ms: Date.now() - start,
    model: 'gpt-4o',
  };
}

// Or an Anthropic call:
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: input.input }],
  });
  return {
    result: (response.content[0] as { text: string }).text,
    latency_ms: Date.now() - start,
    model: 'claude-opus-4-5',
  };
}
```

Everything else — the paywall, the HTTP server, the Mainlayer integration — stays the same.

## Multiple Pricing Models

This template supports different pricing strategies. Switch between them by setting `AGENT_PRICING_MODEL` in `.env`:

### 1. Pay-Per-Call (default)

```bash
AGENT_PRICING_MODEL=pay_per_call
AGENT_PRICE_USDC=0.01  # $0.01 per call
```

Every call costs exactly `$0.01`.

### 2. Subscription (monthly recurring)

```bash
AGENT_PRICING_MODEL=subscription
AGENT_SUBSCRIPTION_PRICE_USDC=9.99
AGENT_SUBSCRIPTION_INTERVAL=month
```

Users subscribe at `$9.99/month` for unlimited calls.

### 3. Freemium (free tier with paid upgrades)

```bash
AGENT_PRICING_MODEL=freemium
AGENT_FREE_CALLS_PER_DAY=5
AGENT_PAID_PRICE_USDC=0.01
```

Users get 5 free calls/day, then pay $0.01 per call.

### 4. Usage-Based (pay based on tokens or complexity)

```bash
AGENT_PRICING_MODEL=usage_based
AGENT_PRICE_PER_1000_TOKENS=0.05
```

Price scales with the size of the request (e.g. $0.05 per 1000 tokens used).

## Revenue Tracking Dashboard

The template includes endpoints for tracking earnings:

**`GET /revenue`** — Current revenue summary (requires API key)

```bash
curl -H "Authorization: Bearer ${MAINLAYER_API_KEY}" http://localhost:3000/revenue
```

Response:
```json
{
  "total_revenue_usd": 1234.56,
  "total_calls": 45678,
  "unique_payers": 2341,
  "average_price_per_call": 0.027,
  "revenue_by_period": {
    "today": 12.34,
    "this_week": 89.12,
    "this_month": 567.89
  },
  "top_features": [
    { "input_preview": "Summarize this article", "call_count": 234 }
  ]
}
```

**`GET /revenue/breakdown`** — Revenue breakdown by pricing model

```json
{
  "pay_per_call": { "revenue": 800.00, "percentage": 65 },
  "subscription": { "revenue": 400.00, "percentage": 35 }
}
```

## How the payment flow works

```
Client                  This Agent              Mainlayer API
  |                         |                        |
  |-- GET /info ----------->|                        |
  |<-- price, resource_id --|                        |
  |                         |                        |
  |-- POST /payments ----------------------------------------->|
  |   { resource_id, payer_wallet }                 |
  |<-- payment confirmed ----------------------------------|
  |                         |                        |
  |-- POST /run ----------->|                        |
  |   X-Payer-Wallet: ...   |                        |
  |                         |-- GET /entitlements/check -->|
  |                         |   ?resource_id=&payer_wallet=|
  |                         |<-- { allowed: true } --------|
  |                         |                        |
  |                         |-- runAgent(input) -->  |
  |                         |<-- AgentOutput ------  |
  |                         |                        |
  |<-- 200 { output } ------|                        |

If not paid:
  |-- POST /run ----------->|                        |
  |   X-Payer-Wallet: ...   |                        |
  |                         |-- GET /entitlements/check -->|
  |                         |<-- { allowed: false } -------|
  |<-- 402 { payment_details, instructions } -------|
```

## API reference

### `GET /health`

Public health check. No auth required.

```json
{ "status": "ok", "agent": "AI Summarizer Agent", "timestamp": "..." }
```

### `GET /info`

Public info about this agent: price, resource ID, payment instructions.

```json
{
  "name": "AI Summarizer Agent",
  "description": "...",
  "price_usdc": 0.01,
  "resource_id": "res_...",
  "payment": {
    "pay_endpoint": "https://api.mainlayer.fr/payments",
    "required_header": "X-Payer-Wallet"
  }
}
```

### `POST /run`

Run the agent. Requires a Mainlayer payment.

**Request headers:**
```
X-Payer-Wallet: <your_wallet_address>
Content-Type: application/json
```

**Request body:**
```json
{
  "input": "Text to process",
  "style": "brief" | "detailed" | "bullet"
}
```

**200 — Success:**
```json
{
  "success": true,
  "output": {
    "result": "...",
    "tokens_used": 42,
    "latency_ms": 312,
    "model": "gpt-4o"
  },
  "entitlement_id": "ent_..."
}
```

**402 — Payment required:**
```json
{
  "error": "payment_required",
  "message": "=== PAYMENT REQUIRED ===\n...",
  "payment_details": {
    "resource_id": "res_...",
    "price_usdc": 0.01,
    "pay_endpoint": "https://api.mainlayer.fr/payments"
  }
}
```

## Agent-to-agent example

The most powerful use case: an AI agent autonomously pays another AI agent.

```bash
# Set caller agent's credentials
export CALLER_AGENT_API_KEY=ml_caller_key
export CALLER_AGENT_WALLET=wallet_caller_address

# Run the example
npx ts-node examples/agent-calls-agent.ts
```

The calling agent will:
1. Discover the vendor agent and its price
2. Decide whether the price fits within its budget
3. Pay via Mainlayer automatically
4. Call the vendor agent and use the result

This is a fully autonomous economic transaction between agents — no human interaction required.

## Deployment

### Docker (recommended)

```bash
# Build and run
docker compose up -d

# Check health
curl http://localhost:3000/health
```

### Railway

```bash
railway login
railway init
railway up
railway variables set MAINLAYER_API_KEY=ml_... MAINLAYER_RESOURCE_ID=res_...
```

### Render

1. Connect your GitHub repo to Render
2. Set build command: `npm run build`
3. Set start command: `npm start`
4. Add environment variables in the Render dashboard

### Manual (any VPS)

```bash
npm install
npm run build
MAINLAYER_API_KEY=ml_... MAINLAYER_RESOURCE_ID=res_... npm start
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAINLAYER_API_KEY` | Yes | — | Your Mainlayer vendor API key |
| `MAINLAYER_RESOURCE_ID` | Yes (after setup) | — | Set by `npm run setup` |
| `AGENT_PORT` | No | `3000` | HTTP server port |
| `AGENT_PRICE_USDC` | No | `0.01` | Price per call in USDC |
| `AGENT_SLUG` | No | `ai-summarizer-agent` | Mainlayer resource slug |
| `AGENT_NAME` | No | `AI Summarizer Agent` | Display name |
| `AGENT_DESCRIPTION` | No | See .env.example | Service description |
| `AGENT_CALLBACK_URL` | No | — | Webhook URL for payment events |

## License

MIT
