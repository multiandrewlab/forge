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
    yield chunk;
  }
}
