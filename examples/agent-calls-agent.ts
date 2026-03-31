/**
 * agent-calls-agent.ts
 *
 * Example: Fully autonomous agent-to-agent payment and invocation.
 *
 * This is the most powerful use case of Mainlayer — an AI agent autonomously:
 *   1. Discovers another agent and its price
 *   2. Decides whether to pay (cost-benefit check)
 *   3. Pays via Mainlayer
 *   4. Calls the agent and uses its output
 *   5. Checks its earnings (as a vendor) via analytics
 *
 * No human in the loop. Agents transacting with agents.
 *
 * Run:
 *   npx ts-node examples/agent-calls-agent.ts
 *
 * Prerequisites:
 *   - CALLER_AGENT_API_KEY — the calling agent's Mainlayer API key
 *   - CALLER_AGENT_WALLET — the calling agent's wallet address
 *   - VENDOR_AGENT_URL — the vendor agent's base URL (default: localhost:3000)
 *   - VENDOR_AGENT_API_KEY — the vendor agent's Mainlayer API key (for analytics)
 */

import axios, { AxiosError } from 'axios';

const MAINLAYER_API_BASE = 'https://api.mainlayer.xyz';
const VENDOR_AGENT_URL = process.env.VENDOR_AGENT_URL ?? 'http://localhost:3000';
const CALLER_API_KEY = process.env.CALLER_AGENT_API_KEY ?? '';
const CALLER_WALLET = process.env.CALLER_AGENT_WALLET ?? '';
const VENDOR_API_KEY = process.env.VENDOR_AGENT_API_KEY ?? ''; // for analytics demo

// ---------------------------------------------------------------------------
// Caller agent logic
// ---------------------------------------------------------------------------

interface AgentInfo {
  name: string;
  description: string;
  price_usdc: number;
  resource_id: string;
  configured: boolean;
}

/**
 * The caller agent: autonomously discovers, pays, and calls a vendor agent.
 */
async function callerAgent(): Promise<void> {
  console.log('=== Caller Agent: Starting Autonomous Agent-to-Agent Transaction ===\n');
  console.log('I am an AI agent. I need to summarize some text.');
  console.log('I will find and pay another agent to do it for me.\n');

  if (!CALLER_API_KEY || !CALLER_WALLET) {
    console.error('Caller agent needs CALLER_AGENT_API_KEY and CALLER_AGENT_WALLET to proceed.');
    process.exit(1);
  }

  // --- Phase 1: Discovery ---
  console.log('[DISCOVER] Checking vendor agent capabilities and price...');

  let info: AgentInfo;
  try {
    const { data } = await axios.get<AgentInfo>(`${VENDOR_AGENT_URL}/info`, { timeout: 10_000 });
    info = data;
  } catch {
    console.error('[DISCOVER] Failed to reach vendor agent. Is it running?');
    process.exit(1);
  }

  console.log(`[DISCOVER] Found: "${info.name}"`);
  console.log(`[DISCOVER] What it does: ${info.description}`);
  console.log(`[DISCOVER] Price: $${info.price_usdc} USDC per call`);

  if (!info.configured || !info.resource_id) {
    console.error('[DISCOVER] Vendor agent is not configured for payments. Aborting.');
    process.exit(1);
  }

  // --- Phase 2: Cost-benefit decision ---
  console.log('\n[DECIDE] Evaluating whether to pay...');
  const BUDGET_LIMIT_USDC = 0.10; // The caller agent's budget cap per sub-task

  if (info.price_usdc > BUDGET_LIMIT_USDC) {
    console.log(`[DECIDE] Price $${info.price_usdc} exceeds budget limit $${BUDGET_LIMIT_USDC}. Skipping.`);
    process.exit(0);
  }

  console.log(`[DECIDE] Price $${info.price_usdc} is within budget. Proceeding with payment.`);

  // --- Phase 3: Payment ---
  console.log('\n[PAY] Submitting payment to Mainlayer...');

  try {
    await axios.post(
      `${MAINLAYER_API_BASE}/payments`,
      {
        resource_id: info.resource_id,
        payer_wallet: CALLER_WALLET,
      },
      {
        headers: {
          Authorization: `Bearer ${CALLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      }
    );
    console.log('[PAY] Payment confirmed by Mainlayer.');
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
    const msg = axiosErr.response?.data?.error ?? axiosErr.message;
    console.error(`[PAY] Payment failed: ${msg}`);
    process.exit(1);
  }

  // --- Phase 4: Call the vendor agent ---
  const taskInput = [
    'The caller agent received a large document about machine learning trends in 2025.',
    'Key topics include: multimodal models, reasoning improvements, agent frameworks,',
    'efficiency breakthroughs, and the rise of specialized hardware for inference.',
    'The caller agent needs a concise summary to pass upstream in a pipeline.',
  ].join(' ');

  console.log('\n[CALL] Invoking vendor agent with task input...');

  let agentResult: string;
  try {
    const { data } = await axios.post<{
      success: boolean;
      output: { result: string; latency_ms: number; model: string };
    }>(
      `${VENDOR_AGENT_URL}/run`,
      { input: taskInput, style: 'bullet' },
      {
        headers: {
          'X-Payer-Wallet': CALLER_WALLET,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );

    agentResult = data.output.result;
    console.log(`[CALL] Got response in ${data.output.latency_ms}ms from model: ${data.output.model}`);
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
    if (axiosErr.response?.status === 402) {
      console.error('[CALL] 402 — Payment not settled yet. Retry in a moment.');
    } else {
      console.error(`[CALL] Failed: ${axiosErr.response?.data?.message ?? axiosErr.message}`);
    }
    process.exit(1);
  }

  // --- Phase 5: Use the result ---
  console.log('\n[RESULT] Vendor agent output received. Incorporating into pipeline...\n');
  console.log('--- Vendor Agent Output ---');
  console.log(agentResult);
  console.log('---------------------------\n');
  console.log('[DONE] Caller agent successfully used a paid vendor agent. Transaction complete.');
  console.log('        The caller paid, the vendor earned, no human was involved.\n');

  // --- Phase 6: Optional — check vendor earnings ---
  if (VENDOR_API_KEY) {
    console.log('[ANALYTICS] Checking vendor agent earnings...');
    try {
      const { data } = await axios.get<{
        total_calls: number;
        total_revenue_usdc: number;
      }>(`${MAINLAYER_API_BASE}/analytics`, {
        headers: { Authorization: `Bearer ${VENDOR_API_KEY}` },
        timeout: 10_000,
      });
      console.log(`[ANALYTICS] Total calls served: ${data.total_calls}`);
      console.log(`[ANALYTICS] Total revenue:      $${data.total_revenue_usdc?.toFixed(4) ?? '0.0000'} USDC`);
    } catch {
      console.log('[ANALYTICS] Could not fetch analytics (optional step).');
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

callerAgent().catch((err: Error) => {
  console.error('\nUnexpected error in caller agent:', err.message);
  process.exit(1);
});
