/**
 * agent.ts
 *
 * The AI agent logic. This is the part you replace with your own implementation.
 *
 * This demo summarizes text. In production, swap this out for:
 *   - An OpenAI/Anthropic/Gemini API call
 *   - A local model inference call
 *   - Any computation or data retrieval you want to monetize
 *
 * The agent is completely decoupled from the payment logic — it just
 * receives input and returns output. The paywall is handled in paywall.ts
 * and wired up in index.ts.
 */

export interface AgentInput {
  /** The text or prompt to process. */
  input: string;
  /** Optional style hint for how to format the output. */
  style?: 'brief' | 'detailed' | 'bullet';
}

export interface AgentOutput {
  /** The agent's response. */
  result: string;
  /** Tokens used (if applicable — helps clients track usage). */
  tokens_used?: number;
  /** Processing time in milliseconds. */
  latency_ms: number;
  /** Model or method used. */
  model: string;
}

/**
 * Run the AI agent on the given input.
 *
 * DEMO IMPLEMENTATION — replace this with your own AI logic.
 *
 * Production examples:
 * ```typescript
 * // OpenAI
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: input.input }],
 * });
 * return { result: response.choices[0].message.content!, ... };
 *
 * // Anthropic
 * const response = await anthropic.messages.create({
 *   model: 'claude-opus-4-5',
 *   messages: [{ role: 'user', content: input.input }],
 * });
 * return { result: response.content[0].text, ... };
 * ```
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const start = Date.now();

  // Demo logic — simulates summarization
  const { input: text, style = 'brief' } = input;

  const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;
  let result: string;

  if (style === 'bullet') {
    result = [
      `Key points from: "${preview}"`,
      '',
      '- Main topic identified and analyzed',
      '- Core argument extracted and condensed',
      '- Supporting details distilled to essentials',
      '',
      '[Replace this with real AI output from your model of choice]',
    ].join('\n');
  } else if (style === 'detailed') {
    result = [
      `Detailed summary of: "${preview}"`,
      '',
      'This text covers the following main ideas: [AI analysis here].',
      'The author argues that [key point here].',
      'Supporting evidence includes [supporting details here].',
      '',
      'Conclusion: [synthesized insight here].',
      '',
      '[Replace this with real AI output from your model of choice]',
    ].join('\n');
  } else {
    result = `Summary: "${preview}" — [AI-generated summary here]. Replace this with a real model call.`;
  }

  const latency_ms = Date.now() - start;

  return {
    result,
    tokens_used: Math.ceil(text.length / 4), // rough estimate
    latency_ms,
    model: 'demo-agent-v1',
  };
}
