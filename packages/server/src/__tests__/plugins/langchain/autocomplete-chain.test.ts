import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type {
  AutocompleteChain,
  AutocompleteInput,
} from '../../../plugins/langchain/chains/autocomplete.js';
import {
  createAutocompleteChain,
  streamAutocomplete,
} from '../../../plugins/langchain/chains/autocomplete.js';

function makeFakeChain(chunks: string[]): AutocompleteChain {
  return {
    stream(_input: AutocompleteInput, opts?: { signal?: AbortSignal }) {
      async function* gen() {
        for (const c of chunks) {
          if (opts?.signal?.aborted) throw new Error('aborted');
          yield c;
        }
      }
      return Promise.resolve(gen());
    },
  } as unknown as AutocompleteChain;
}

describe('createAutocompleteChain', () => {
  it('returns an object with a stream method', () => {
    const model = new FakeListChatModel({ responses: ['completion'] });
    const chain = createAutocompleteChain(model);
    expect(typeof chain.stream).toBe('function');
  });
});

describe('streamAutocomplete', () => {
  it('yields each chunk from the underlying stream', async () => {
    const chain = makeFakeChain(['hello ', 'world']);
    const out: string[] = [];
    for await (const tok of streamAutocomplete(chain, {
      before: 'x',
      after: 'y',
      language: 'js',
    })) {
      out.push(tok);
    }
    expect(out).toEqual(['hello ', 'world']);
  });

  it('respects AbortSignal', async () => {
    const chain = makeFakeChain(['a', 'b', 'c']);
    const ac = new AbortController();
    const iter = streamAutocomplete(
      chain,
      { before: '', after: '', language: 'js' },
      { signal: ac.signal },
    );
    ac.abort();
    const collected: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of iter) {
          collected.push(chunk);
        }
      })(),
    ).rejects.toThrow();
  });
});
