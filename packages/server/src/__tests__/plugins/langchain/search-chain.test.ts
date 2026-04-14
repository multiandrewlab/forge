import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchChain, SearchInput } from '../../../plugins/langchain/chains/search.js';
import { createSearchChain, runSearchChain } from '../../../plugins/langchain/chains/search.js';

function makeChainWithInvoke(result: string | Error): SearchChain {
  return {
    invoke(_input: SearchInput) {
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      return Promise.resolve(result);
    },
  } as unknown as SearchChain;
}

describe('createSearchChain', () => {
  it('returns an object with an invoke method', () => {
    const model = new FakeListChatModel({ responses: ['{}'] });
    const chain = createSearchChain(model as unknown as BaseChatModel);
    expect(typeof chain.invoke).toBe('function');
  });
});

describe('runSearchChain', () => {
  it('returns parsed AiSearchFilters on valid JSON', async () => {
    const json = JSON.stringify({
      tags: ['react'],
      language: null,
      contentType: null,
      textQuery: 'hooks',
    });
    const chain = makeChainWithInvoke(json);
    const result = await runSearchChain(chain, 'React hooks');
    expect(result).toEqual({
      tags: ['react'],
      language: null,
      contentType: null,
      textQuery: 'hooks',
    });
  });

  it('returns null on invalid JSON', async () => {
    const chain = makeChainWithInvoke('not json');
    const result = await runSearchChain(chain, 'some query');
    expect(result).toBeNull();
  });

  it('returns null when model throws an error', async () => {
    const chain = makeChainWithInvoke(new Error('model failure'));
    const result = await runSearchChain(chain, 'some query');
    expect(result).toBeNull();
  });

  it('returns null on partial/malformed fields (missing textQuery)', async () => {
    const json = JSON.stringify({ tags: ['react'] });
    const chain = makeChainWithInvoke(json);
    const result = await runSearchChain(chain, 'React');
    expect(result).toBeNull();
  });

  it('returns null when tags field has wrong type', async () => {
    const json = JSON.stringify({
      tags: 'not-an-array',
      language: null,
      contentType: null,
      textQuery: 'something',
    });
    const chain = makeChainWithInvoke(json);
    const result = await runSearchChain(chain, 'something');
    expect(result).toBeNull();
  });
});
