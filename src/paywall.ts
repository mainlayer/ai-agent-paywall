/**
 * paywall.ts
 *
 * Payment verification middleware for the AI agent server.
 *
 * This module provides a single function — verifyPayment — that checks
 * whether a caller has a valid Mainlayer entitlement before the agent runs.
 *
 * How it works:
 *   1. Client sends their wallet address in the X-Payer-Wallet header.
 *   2. We call GET /entitlements/check on the Mainlayer API.
 *   3. If allowed: return { allowed: true }.
 *   4. If not allowed: return { allowed: false } with payment instructions.
 *
 * This is intentionally a thin wrapper around the Mainlayer client so it
 * stays easy to test and swap out.
 */

import { AxiosError } from 'axios';
import { checkEntitlement, buildPaymentInstructions } from './mainlayer.js';

export interface PaymentResult {
  allowed: boolean;
  /** Set when allowed — the entitlement details. */
  entitlement?: {
    id: string;
    resource_id: string;
    payer_wallet: string;
    status: string;
  };
  /** Set when not allowed — human/agent-readable instructions. */
  message?: string;
  /** Set when not allowed — structured data for agent parsers. */
  payment_details?: {
    resource_id: string;
    price_usdc: number;
    pay_endpoint: string;
  };
}

/**
 * Verify that a payer has a valid Mainlayer entitlement for a resource.
 *
 * Returns { allowed: true, entitlement } if payment is confirmed.
 * Returns { allowed: false, message, payment_details } if not paid.
 * Throws if the Mainlayer API call itself fails (network error, bad API key, etc.).
 *
 * @param resourceId - The Mainlayer resource ID for this agent's service.
 * @param payerWallet - The wallet address from the X-Payer-Wallet header.
 * @param apiKey - Your Mainlayer vendor API key.
 * @param priceUsdc - The price per call in USDC (used in the payment message).
 * @param description - A human-readable description of this service.
 */
export async function verifyPayment(
  resourceId: string,
  payerWallet: string,
  apiKey: string,
  priceUsdc: number,
  description: string
): Promise<PaymentResult> {
  let result;

  try {
    result = await checkEntitlement(resourceId, payerWallet, apiKey);
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;

    if (axiosErr.response?.status === 401) {
      throw new MainlayerConfigError(
        'Mainlayer API key is invalid or missing. ' +
        'Check your MAINLAYER_API_KEY environment variable.'
      );
    }

    throw new MainlayerConfigError(
      `Mainlayer entitlement check failed: ${axiosErr.message}. ` +
      'Check your network connection and try again.'
    );
  }

  if (result.allowed && result.entitlement) {
    return {
      allowed: true,
      entitlement: result.entitlement,
    };
  }

  // Not allowed — build helpful payment instructions
  const effectivePriceUsdc = result.resource?.price_usdc ?? priceUsdc;
  const effectiveDescription = result.resource?.description ?? description;

  return {
    allowed: false,
    message: buildPaymentInstructions(resourceId, effectivePriceUsdc, effectiveDescription),
    payment_details: {
      resource_id: resourceId,
      price_usdc: effectivePriceUsdc,
      pay_endpoint: 'https://api.mainlayer.xyz/payments',
    },
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the paywall cannot function due to server misconfiguration
 * (missing or invalid API key, missing resource ID, etc.).
 *
 * These should map to 500 Internal Server Error — they indicate a server
 * setup problem, not a client payment problem.
 */
export class MainlayerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MainlayerConfigError';
  }
}
