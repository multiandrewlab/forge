import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Runnable } from '@langchain/core/runnables';
import { autocompletePrompt } from '../prompts/autocomplete.js';

export type AutocompleteInput = {
  before: string;
  after: string;
  language: string;
};

export type AutocompleteChain = Runnable<AutocompleteInput, string>;

export function createAutocompleteChain(model: BaseChatModel): AutocompleteChain {
  return autocompletePrompt
    .pipe(model)
    .pipe(new StringOutputParser()) as unknown as AutocompleteChain;
}

export async function* streamAutocomplete(
  chain: AutocompleteChain,
  input: AutocompleteInput,
  options: { signal?: AbortSignal } = {},
): AsyncIterable<string> {
  const stream = await chain.stream(input, { signal: options.signal });
  for await (const chunk of stream) {
    // Sentinel chunks from mock-scripts.ts are control markers, not user-visible
    // tokens. `[done]` ends the stream cleanly. `[error:<code>]` surfaces a thrown
    // error which the route layer converts into an SSE `event: error`.
    if (chunk === '[done]') {
      return;
    }
    const errorMatch = /^\[error:([a-z_]+)\]$/.exec(chunk);
    if (errorMatch) {
      // The regex's `[a-z_]+` ensures the capture group is always present.
      const code = errorMatch[1] as string;
      const messages: Record<string, string> = {
        rate_limit: 'Rate limit exceeded — too many requests. Please try again shortly.',
      };
      throw new Error(messages[code] ?? `mock_error:${code}`);
    }
    yield chunk;
  }
}
