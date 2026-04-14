import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Runnable } from '@langchain/core/runnables';
import type { AiSearchFilters } from '@forge/shared';
import { aiSearchFiltersSchema } from '@forge/shared';
import { searchPrompt } from '../prompts/search.js';

export type SearchInput = {
  query: string;
};

export type SearchChain = Runnable<SearchInput, string>;

export function createSearchChain(model: BaseChatModel): SearchChain {
  return searchPrompt.pipe(model).pipe(new StringOutputParser()) as unknown as SearchChain;
}

export async function runSearchChain(
  chain: SearchChain,
  query: string,
): Promise<AiSearchFilters | null> {
  try {
    const result = await chain.invoke({ query });
    const parsed: unknown = JSON.parse(result);
    const validation = aiSearchFiltersSchema.safeParse(parsed);
    if (!validation.success) {
      return null;
    }
    return validation.data;
  } catch {
    return null;
  }
}
