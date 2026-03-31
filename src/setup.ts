#!/usr/bin/env ts-node
/**
 * setup.ts
 *
 * One-time setup script: registers this AI agent as a paid resource on Mainlayer.
 *
 * What it does:
 *   1. Reads your MAINLAYER_API_KEY from .env.
 *   2. Creates a resource on Mainlayer with the configured slug, price, and description.
 *   3. Prints the resource ID — copy it into your .env as MAINLAYER_RESOURCE_ID.
 *
 * Usage:
 *   npm run setup
 *
 * Prerequisites:
 *   - A Mainlayer account (https://mainlayer.fr)
 *   - MAINLAYER_API_KEY set in .env
 *   - (Optional) Customize AGENT_PRICE_USDC and AGENT_DESCRIPTION in .env
 */

import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { createResource, MAINLAYER_API_BASE } from './mainlayer.js';

// ---------------------------------------------------------------------------
// Resource definition
//
// These values come from your .env file (or the defaults below).
// Customize them before running setup.
// ---------------------------------------------------------------------------

const AGENT_SLUG = process.env.AGENT_SLUG ?? 'ai-summarizer-agent';
const AGENT_PRICE_USDC = parseFloat(process.env.AGENT_PRICE_USDC ?? '0.01');
const AGENT_DESCRIPTION =
  process.env.AGENT_DESCRIPTION ??
  'An AI agent that summarizes text on demand. Pay per call with Mainlayer.';
const AGENT_CALLBACK_URL = process.env.AGENT_CALLBACK_URL; // optional

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

async function setup(): Promise<void> {
  console.log('=== Mainlayer Agent Setup ===\n');

  const apiKey = process.env.MAINLAYER_API_KEY;

  if (!apiKey || apiKey.startsWith('ml_your')) {
    console.error('ERROR: MAINLAYER_API_KEY is not set.\n');
    console.error('Steps to fix:');
    console.error('  1. Copy .env.example to .env');
    console.error('  2. Get your API key at https://dashboard.mainlayer.fr');
    console.error('  3. Set MAINLAYER_API_KEY=ml_your_actual_key in .env');
    console.error('  4. Re-run: npm run setup');
    process.exit(1);
  }

  console.log(`Agent slug:    ${AGENT_SLUG}`);
  console.log(`Price:         $${AGENT_PRICE_USDC.toFixed(4)} USDC per call`);
  console.log(`Description:   ${AGENT_DESCRIPTION}`);
  if (AGENT_CALLBACK_URL) {
    console.log(`Callback URL:  ${AGENT_CALLBACK_URL}`);
  }
  console.log('');
  process.stdout.write('Registering resource on Mainlayer... ');

  try {
    const resource = await createResource(apiKey, {
      slug: AGENT_SLUG,
      type: 'api',
      price_usdc: AGENT_PRICE_USDC,
      fee_model: 'pay_per_call',
      description: AGENT_DESCRIPTION,
      ...(AGENT_CALLBACK_URL ? { callback_url: AGENT_CALLBACK_URL } : {}),
    });

    console.log(`OK\n`);
    console.log('=== Copy this into your .env file ===\n');
    console.log(`MAINLAYER_RESOURCE_ID=${resource.id}`);
    console.log('\n=====================================\n');
    console.log('Setup complete! Next steps:');
    console.log('  1. Add MAINLAYER_RESOURCE_ID to your .env');
    console.log('  2. Start the server: npm start');
    console.log('  3. Check agent info: curl http://localhost:3000/info');
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;

    if (axiosErr.response?.status === 409) {
      console.log('SKIPPED (resource already exists)\n');
      console.log('A resource with this slug already exists on your account.');
      console.log('To find the existing resource ID, log into https://dashboard.mainlayer.fr');
      console.log('\nIf you want a fresh resource, change AGENT_SLUG in your .env and re-run.');
      process.exit(0);
    }

    if (axiosErr.response?.status === 401) {
      console.error('FAILED (invalid API key)\n');
      console.error('Your MAINLAYER_API_KEY appears to be invalid.');
      console.error('Get a valid key at: https://dashboard.mainlayer.fr');
      process.exit(1);
    }

    const message =
      axiosErr.response?.data?.error ??
      axiosErr.response?.data?.message ??
      axiosErr.message;
    console.error(`FAILED\n`);
    console.error(`Error: ${message}`);
    console.error(`\nIf this persists, check https://mainlayer.fr/status or open an issue.`);
    process.exit(1);
  }
}

setup().catch((err: Error) => {
  console.error('\nUnexpected error during setup:', err.message);
  process.exit(1);
});
