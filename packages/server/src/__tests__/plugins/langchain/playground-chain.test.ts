import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type {
  PlaygroundChain,
  PlaygroundInput,
} from '../../../plugins/langchain/chains/playground.js';
import {
  createPlaygroundChain,
  streamPlayground,
} from '../../../plugins/langchain/chains/playground.js';

function makeFakeChain(chunks: string[]): PlaygroundChain {
  return {
    stream(_input: PlaygroundInput, opts?: { signal?: AbortSignal }) {
      async function* gen() {
        for (const c of chunks) {
          if (opts?.signal?.aborted) throw new Error('aborted');
          yield c;
        }
      }
      return Promise.resolve(gen());
    },
  } as unknown as PlaygroundChain;
}

describe('createPlaygroundChain', () => {
  it('returns a Runnable with a stream method', () => {
    const model = new FakeListChatModel({ responses: ['hello world'] });
    const chain = createPlaygroundChain(model);
    expect(chain).toBeTruthy();
    expect(typeof chain.stream).toBe('function');
  });

  it('streams prompt through the model and returns string output', async () => {
    const model = new FakeListChatModel({ responses: ['response from model'] });
    const chain = createPlaygroundChain(model);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'Hello, how are you?' })) {
      out.push(tok);
    }
    expect(out.join('')).toContain('response from model');
  });
});

describe('streamPlayground', () => {
  it('yields tokens from the fake chain in order', async () => {
    const chain = makeFakeChain(['hello ', 'world']);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'test prompt' })) {
      out.push(tok);
    }
    expect(out).toEqual(['hello ', 'world']);
  });

  it('respects AbortSignal — pre-aborted signal throws', async () => {
    const chain = makeFakeChain(['a', 'b', 'c']);
    const ac = new AbortController();
    ac.abort();
    const iter = streamPlayground(chain, { prompt: 'test' }, { signal: ac.signal });
    const collected: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of iter) {
          collected.push(chunk);
        }
      })(),
    ).rejects.toThrow();
  });

  it('surfaces model errors as thrown exceptions', async () => {
    const errorChain = {
      stream() {
        async function* gen(): AsyncGenerator<string> {
          yield 'partial';
          throw new Error('model exploded');
        }
        return Promise.resolve(gen());
      },
    } as unknown as PlaygroundChain;

    const collected: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of streamPlayground(errorChain, {
          prompt: 'test',
        })) {
          collected.push(chunk);
        }
      })(),
    ).rejects.toThrow('model exploded');
  });

  it('handles empty chunk without hanging', async () => {
    const chain = makeFakeChain(['']);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'empty test' })) {
      out.push(tok);
    }
    expect(out.join('')).toBe('');
  });

  it('passes options through when no signal provided', async () => {
    const chain = makeFakeChain(['token']);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'no signal' })) {
      out.push(tok);
    }
    expect(out).toEqual(['token']);
  });
});
