/**
 * call-agent.ts
 *
 * Example: A client (human or agent) calling the paywalled AI agent.
 *
 * This shows the full happy path:
 *   1. Discover the agent's price via GET /info
 *   2. Pay with Mainlayer
 *   3. Call the agent with the payer wallet
 *
 * Run this after starting the server (npm start) and configuring .env.
 *
 * Usage:
 *   npx ts-node examples/call-agent.ts
 *
 * Prerequisites:
 *   - Server running on localhost:3000
 *   - PAYER_MAINLAYER_API_KEY set in environment (the paying client's key)
 *   - PAYER_WALLET set in environment (the paying client's wallet address)
 */

import axios, { AxiosError } from 'axios';

const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? 'http://localhost:3000';
const PAYER_API_KEY = process.env.PAYER_MAINLAYER_API_KEY ?? '';
const PAYER_WALLET = process.env.PAYER_WALLET ?? '';
const MAINLAYER_API_BASE = 'https://api.mainlayer.xyz';

interface AgentInfo {
  name: string;
  description: string;
  price_usdc: number;
  resource_id: string;
  payment: {
    pay_endpoint: string;
    required_header: string;
  };
}

interface AgentOutput {
  success: boolean;
  output: {
    result: string;
    tokens_used?: number;
    latency_ms: number;
    model: string;
  };
  entitlement_id: string;
}

async function main(): Promise<void> {
  console.log('=== AI Agent Paywall — Client Example ===\n');

  if (!PAYER_API_KEY || !PAYER_WALLET) {
    console.error('Set PAYER_MAINLAYER_API_KEY and PAYER_WALLET environment variables.');
    console.error('Example:');
    console.error('  PAYER_MAINLAYER_API_KEY=ml_... PAYER_WALLET=wallet_... npx ts-node examples/call-agent.ts');
    process.exit(1);
  }

  // Step 1: Discover the agent
  console.log('Step 1: Discovering agent info...');
  let info: AgentInfo;
  try {
    const { data } = await axios.get<AgentInfo>(`${AGENT_BASE_URL}/info`);
    info = data;
    console.log(`  Name:        ${info.name}`);
    console.log(`  Description: ${info.description}`);
    console.log(`  Price:       $${info.price_usdc} USDC per call`);
    console.log(`  Resource ID: ${info.resource_id}`);
    console.log('');
  } catch (err) {
    console.error('Failed to reach the agent. Is the server running?');
    console.error(`  URL: ${AGENT_BASE_URL}/info`);
    process.exit(1);
  }

  // Step 2: Pay for access
  console.log('Step 2: Paying with Mainlayer...');
  try {
    await axios.post(
      `${MAINLAYER_API_BASE}/payments`,
      {
        resource_id: info.resource_id,
        payer_wallet: PAYER_WALLET,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      }
    );
    console.log('  Payment confirmed.\n');
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
    const msg = axiosErr.response?.data?.error ?? axiosErr.response?.data?.message ?? axiosErr.message;
    console.error(`  Payment failed: ${msg}`);
    console.error('  Check your PAYER_MAINLAYER_API_KEY and PAYER_WALLET.');
    process.exit(1);
  }

  // Step 3: Call the agent
  console.log('Step 3: Calling the agent...');
  const inputText = 'The history of artificial intelligence spans decades, from early rule-based systems to modern large language models that can reason, code, and generate creative content.';

  try {
    const { data } = await axios.post<AgentOutput>(
      `${AGENT_BASE_URL}/run`,
      { input: inputText, style: 'bullet' },
      {
        headers: {
          'X-Payer-Wallet': PAYER_WALLET,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );

    console.log('\n=== Agent Output ===\n');
    console.log(data.output.result);
    console.log('\n===================');
    console.log(`Model:         ${data.output.model}`);
    console.log(`Tokens used:   ${data.output.tokens_used ?? 'n/a'}`);
    console.log(`Latency:       ${data.output.latency_ms}ms`);
    console.log(`Entitlement:   ${data.entitlement_id}`);
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;

    if (axiosErr.response?.status === 402) {
      console.error('  402 Payment Required — payment was not recognized yet.');
      console.error('  This can happen if the payment takes a moment to settle.');
      console.error('  Wait a second and retry.');
    } else {
      const msg = axiosErr.response?.data?.error ?? axiosErr.response?.data?.message ?? axiosErr.message;
      console.error(`  Agent call failed: ${msg}`);
    }
    process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
