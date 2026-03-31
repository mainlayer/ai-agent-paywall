/**
 * index.ts — AI Agent Paywall Server
 *
 * An Express HTTP server that exposes an AI agent as a paid API using Mainlayer.
 *
 * Endpoints:
 *   GET  /health  — Health check (public)
 *   GET  /info    — Agent info: price, description, how to pay (public)
 *   POST /run     — Run the agent (requires Mainlayer payment)
 *
 * Payment flow:
 *   1. Client sends POST /run with X-Payer-Wallet header.
 *   2. Server checks entitlement on Mainlayer.
 *   3. If paid: run agent, return 200 with output.
 *   4. If not paid: return 402 with payment instructions.
 *
 * Usage:
 *   npm start       # Run production server
 *   npm run dev     # Run with ts-node
 *   npm run setup   # One-time resource registration on Mainlayer
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { runAgent, AgentInput } from './agent.js';
import { verifyPayment, MainlayerConfigError } from './paywall.js';
import { MAINLAYER_API_BASE } from './mainlayer.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.AGENT_PORT ?? '3000', 10);
const MAINLAYER_API_KEY = process.env.MAINLAYER_API_KEY ?? '';
const MAINLAYER_RESOURCE_ID = process.env.MAINLAYER_RESOURCE_ID ?? '';
const AGENT_PRICE_USDC = parseFloat(process.env.AGENT_PRICE_USDC ?? '0.01');
const AGENT_NAME = process.env.AGENT_NAME ?? 'AI Summarizer Agent';
const AGENT_DESCRIPTION =
  process.env.AGENT_DESCRIPTION ??
  'An AI agent that summarizes text on demand. Pay per call with Mainlayer.';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Simple health check. No auth required.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    agent: AGENT_NAME,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /info
 * Public info about this agent: what it does, what it costs, how to pay.
 * Clients and other agents use this to discover the agent's capabilities.
 */
app.get('/info', (_req: Request, res: Response) => {
  const configured = Boolean(MAINLAYER_API_KEY && MAINLAYER_RESOURCE_ID);

  res.json({
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    price_usdc: AGENT_PRICE_USDC,
    fee_model: 'pay_per_call',
    resource_id: MAINLAYER_RESOURCE_ID || null,
    configured,
    endpoints: {
      run: 'POST /run',
      info: 'GET /info',
      health: 'GET /health',
    },
    payment: configured
      ? {
          pay_endpoint: `${MAINLAYER_API_BASE}/payments`,
          required_header: 'X-Payer-Wallet',
          instructions: [
            `1. Pay ${AGENT_PRICE_USDC} USDC via POST ${MAINLAYER_API_BASE}/payments`,
            `   Body: { "resource_id": "${MAINLAYER_RESOURCE_ID}", "payer_wallet": "<your_wallet>" }`,
            '2. Retry POST /run with X-Payer-Wallet: <your_wallet>',
          ],
        }
      : { note: 'Agent not yet configured. Run npm run setup.' },
  });
});

/**
 * POST /run
 * Execute the AI agent. Requires a paying client.
 *
 * Request body:
 *   { "input": "Text to process", "style"?: "brief" | "detailed" | "bullet" }
 *
 * Required headers:
 *   X-Payer-Wallet: <your_mainlayer_wallet_address>
 *
 * Responses:
 *   200 — Agent output
 *   400 — Bad request (missing input)
 *   402 — Payment required (with instructions)
 *   500 — Server error
 */
app.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  // --- Validate required environment ---
  if (!MAINLAYER_API_KEY || !MAINLAYER_RESOURCE_ID) {
    res.status(500).json({
      error: 'server_misconfigured',
      message:
        'This agent is not fully configured. The operator must run `npm run setup` ' +
        'and set MAINLAYER_API_KEY and MAINLAYER_RESOURCE_ID in their environment.',
    });
    return;
  }

  // --- Validate request body ---
  const { input, style } = req.body as Partial<AgentInput>;

  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Missing required field: "input" must be a non-empty string.',
    });
    return;
  }

  if (style !== undefined && !['brief', 'detailed', 'bullet'].includes(style)) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Optional field "style" must be one of: "brief", "detailed", "bullet".',
    });
    return;
  }

  // --- Validate payer wallet header ---
  const payerWallet = req.headers['x-payer-wallet'];

  if (!payerWallet || typeof payerWallet !== 'string' || payerWallet.trim().length === 0) {
    res.status(402).json({
      error: 'payment_required',
      message: 'Missing required header: X-Payer-Wallet. Provide your Mainlayer wallet address.',
      resource_id: MAINLAYER_RESOURCE_ID,
      price_usdc: AGENT_PRICE_USDC,
      pay_endpoint: `${MAINLAYER_API_BASE}/payments`,
    });
    return;
  }

  // --- Check Mainlayer entitlement ---
  let paymentResult;

  try {
    paymentResult = await verifyPayment(
      MAINLAYER_RESOURCE_ID,
      payerWallet,
      MAINLAYER_API_KEY,
      AGENT_PRICE_USDC,
      AGENT_DESCRIPTION
    );
  } catch (err) {
    return next(err);
  }

  if (!paymentResult.allowed) {
    res.status(402).json({
      error: 'payment_required',
      message: paymentResult.message,
      payment_details: paymentResult.payment_details,
    });
    return;
  }

  // --- Run the agent ---
  try {
    const output = await runAgent({ input: input.trim(), style });

    res.json({
      success: true,
      output,
      entitlement_id: paymentResult.entitlement?.id,
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MainlayerConfigError) {
    console.error('[MainlayerConfigError]', err.message);
    res.status(500).json({
      error: 'payment_gateway_error',
      message: err.message,
    });
    return;
  }

  console.error('[UnhandledError]', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred. Please try again.',
  });
});

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found. See GET /info for available endpoints.',
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function validateEnvironment(): void {
  const warnings: string[] = [];

  if (!MAINLAYER_API_KEY) {
    warnings.push('MAINLAYER_API_KEY is not set — payment verification will fail.');
  }
  if (!MAINLAYER_RESOURCE_ID) {
    warnings.push(
      'MAINLAYER_RESOURCE_ID is not set — run `npm run setup` to register this agent on Mainlayer.'
    );
  }

  for (const warning of warnings) {
    console.warn(`[WARNING] ${warning}`);
  }
}

app.listen(PORT, () => {
  validateEnvironment();
  console.log(`AI Agent Paywall running on http://localhost:${PORT}`);
  console.log(`  GET  /health — health check`);
  console.log(`  GET  /info   — agent info and pricing`);
  console.log(`  POST /run    — run the agent (requires payment)`);
  if (!MAINLAYER_RESOURCE_ID) {
    console.log('\nNext step: run `npm run setup` to register this agent on Mainlayer.');
  }
});

export default app;
