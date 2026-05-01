import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { aiSearchFiltersSchema } from '@forge/shared';
import type { SearchChain, SearchInput } from '../../../plugins/langchain/chains/search.js';
import { createSearchChain, runSearchChain } from '../../../plugins/langchain/chains/search.js';
import { ChatMock, mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';

function makeChainWithStream(result: string | string[] | Error): SearchChain {
  return {
    stream(_input: SearchInput) {
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      const chunks = Array.isArray(result) ? result : [result];
      async function* gen() {
        for (const c of chunks) {
          yield c;
        }
      }
      return Promise.resolve(gen());
    },
  } as unknown as SearchChain;
}

describe('createSearchChain', () => {
  it('returns an object with a stream method', () => {
    const model = new FakeListChatModel({ responses: ['{}'] });
    const chain = createSearchChain(model as unknown as BaseChatModel);
    expect(typeof chain.stream).toBe('function');
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
    const chain = makeChainWithStream(json);
    const result = await runSearchChain(chain, 'React hooks');
    expect(result).toEqual({
      tags: ['react'],
      language: null,
      contentType: null,
      textQuery: 'hooks',
    });
  });

  it('accumulates streamed chunks before JSON.parse', async () => {
    const json = JSON.stringify({
      tags: ['react'],
      language: null,
      contentType: null,
      textQuery: 'hooks',
    });
    // Split JSON into chunks to ensure accumulation logic works.
    const chunks = [json.slice(0, 10), json.slice(10, 25), json.slice(25)];
    const chain = makeChainWithStream(chunks);
    const result = await runSearchChain(chain, 'React hooks');
    expect(result).toEqual({
      tags: ['react'],
      language: null,
      contentType: null,
      textQuery: 'hooks',
    });
  });

  it('returns null on invalid JSON', async () => {
    const chain = makeChainWithStream('not json');
    const result = await runSearchChain(chain, 'some query');
    expect(result).toBeNull();
  });

  it('returns null when model throws an error', async () => {
    const chain = makeChainWithStream(new Error('model failure'));
    const result = await runSearchChain(chain, 'some query');
    expect(result).toBeNull();
  });

  it('returns null on partial/malformed fields (missing textQuery)', async () => {
    const json = JSON.stringify({ tags: ['react'] });
    const chain = makeChainWithStream(json);
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
    const chain = makeChainWithStream(json);
    const result = await runSearchChain(chain, 'something');
    expect(result).toBeNull();
  });

  // Issue #49 regression test: WU7's reviewers found that runSearchChain
  // used chain.invoke(), but ChatMock._generate throws "only supports streaming."
  // This test exercises the chain end-to-end against ChatMock + the named
  // script key, locking in the streaming contract. WU2's existing tests
  // mocked runSearchChain directly, so this code path was not covered.
  it('runSearchChain integrates with ChatMock via streaming (Issue #49)', async () => {
    const provider = new ChatMock();
    const chain = createSearchChain(provider);
    const filters = await mockScriptStorage.run('search-resolves-to-typescript-tag', () =>
      runSearchChain(chain, 'typescript'),
    );
    expect(filters).not.toBeNull();
    if (filters !== null) {
      expect(filters.tags).toEqual(['typescript']);
      expect(filters.language).toBeNull();
      expect(filters.contentType).toBeNull();
      expect(filters.textQuery).toBe('typescript');
      expect(aiSearchFiltersSchema.safeParse(filters).success).toBe(true);
    }
  });
});
