/**
 * mainlayer.ts
 *
 * Mainlayer API client and helpers.
 *
 * Mainlayer is payment infrastructure for AI agents — "Stripe for AI agents".
 * Vendors (AI agents) register resources, set prices, and only serve paying clients.
 *
 * Core concepts:
 *   - A "resource" is a paywalled service registered on Mainlayer with a price per call.
 *   - An "entitlement" is proof that a payer has purchased access to a resource.
 *   - Before serving any output, we check for a valid entitlement via the API.
 *   - If no entitlement exists, we return 402 with everything the client needs to pay and retry.
 */

import axios, { AxiosError } from 'axios';

export const MAINLAYER_API_BASE = 'https://api.mainlayer.xyz';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceDefinition {
  slug: string;
  type: string;
  price_usdc: number;
  fee_model: 'pay_per_call';
  description: string;
  callback_url?: string;
}

export interface CreatedResource {
  id: string;
  slug: string;
  type: string;
  price_usdc: number;
  fee_model: string;
  description: string;
  created_at: string;
}

export interface EntitlementCheckResult {
  allowed: boolean;
  entitlement?: {
    id: string;
    resource_id: string;
    payer_wallet: string;
    status: 'active' | 'expired' | 'pending';
    expires_at: string | null;
    created_at: string;
  };
  resource?: {
    id: string;
    slug: string;
    price_usdc: number;
    description: string;
  };
  message?: string;
}

export interface AnalyticsResult {
  total_calls: number;
  total_revenue_usdc: number;
  resources: Array<{
    id: string;
    slug: string;
    calls: number;
    revenue_usdc: number;
  }>;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Register a new vendor account on Mainlayer.
 * Only needed if you want the setup script to create a fresh account.
 */
export async function registerVendor(email: string, password: string): Promise<void> {
  await axios.post(
    `${MAINLAYER_API_BASE}/auth/register`,
    { email, password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
  );
}

/**
 * Log in to Mainlayer and return an access token.
 */
export async function login(email: string, password: string): Promise<string> {
  const { data } = await axios.post<{ access_token: string }>(
    `${MAINLAYER_API_BASE}/auth/login`,
    { email, password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
  );
  return data.access_token;
}

/**
 * Create a Mainlayer API key using an access token.
 * Returns the raw API key string.
 */
export async function createApiKey(accessToken: string, name: string): Promise<string> {
  const { data } = await axios.post<{ key: string }>(
    `${MAINLAYER_API_BASE}/api-keys`,
    { name },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    }
  );
  return data.key;
}

// ---------------------------------------------------------------------------
// Resource management
// ---------------------------------------------------------------------------

/**
 * Create a resource (paid service) on Mainlayer.
 * Returns the created resource including its ID.
 */
export async function createResource(
  apiKey: string,
  resource: ResourceDefinition
): Promise<CreatedResource> {
  const { data } = await axios.post<CreatedResource>(
    `${MAINLAYER_API_BASE}/resources`,
    resource,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Entitlement check
// ---------------------------------------------------------------------------

/**
 * Check whether a payer has a valid entitlement to access a resource.
 *
 * Returns { allowed: true } if the payer has paid.
 * Returns { allowed: false, message, resource } if not.
 *
 * @example
 * const result = await checkEntitlement(resourceId, payerWallet, apiKey);
 * if (!result.allowed) {
 *   // Return 402 to client with payment instructions
 * }
 */
export async function checkEntitlement(
  resourceId: string,
  payerWallet: string,
  apiKey: string
): Promise<EntitlementCheckResult> {
  try {
    const { data } = await axios.get<EntitlementCheckResult>(
      `${MAINLAYER_API_BASE}/entitlements/check`,
      {
        params: {
          resource_id: resourceId,
          payer_wallet: payerWallet,
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
    return data;
  } catch (err) {
    const axiosErr = err as AxiosError<EntitlementCheckResult>;

    // 402 means Mainlayer explicitly denied access — treat as "not allowed"
    if (axiosErr.response?.status === 402) {
      return {
        allowed: false,
        resource: axiosErr.response.data?.resource,
        message: axiosErr.response.data?.message ?? 'Payment required.',
      };
    }

    // Re-throw other errors (auth failures, network issues, etc.)
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Fetch revenue analytics for the vendor account.
 */
export async function getAnalytics(apiKey: string): Promise<AnalyticsResult> {
  const { data } = await axios.get<AnalyticsResult>(
    `${MAINLAYER_API_BASE}/analytics`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Payment instructions builder
// ---------------------------------------------------------------------------

/**
 * Build a structured, human- and agent-readable payment instructions block.
 * The format is intentionally machine-parseable — an AI agent reading this
 * should know exactly what endpoint to call and with what payload.
 */
export function buildPaymentInstructions(
  resourceId: string,
  priceUsdc: number,
  description: string
): string {
  return [
    '=== PAYMENT REQUIRED ===',
    '',
    `Service: ${description}`,
    `Price: $${priceUsdc.toFixed(4)} USDC per call`,
    `Resource ID: ${resourceId}`,
    '',
    'To pay with Mainlayer:',
    '',
    `  POST ${MAINLAYER_API_BASE}/payments`,
    `  Authorization: Bearer <your_mainlayer_api_key>`,
    `  Content-Type: application/json`,
    '',
    '  {',
    `    "resource_id": "${resourceId}",`,
    `    "payer_wallet": "<your_wallet_address>"`,
    '  }',
    '',
    'After payment, retry your request with the same X-Payer-Wallet header.',
    '========================',
  ].join('\n');
}
