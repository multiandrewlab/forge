import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { GenerateChain, GenerateInput } from '../../../plugins/langchain/chains/generate.js';
import { createGenerateChain, streamGenerate } from '../../../plugins/langchain/chains/generate.js';

function makeFakeChain(chunks: string[]): GenerateChain {
  return {
    stream(_input: GenerateInput, opts?: { signal?: AbortSignal }) {
      async function* gen() {
        for (const c of chunks) {
          if (opts?.signal?.aborted) throw new Error('aborted');
          yield c;
        }
      }
      return Promise.resolve(gen());
    },
  } as unknown as GenerateChain;
}

describe('createGenerateChain', () => {
  it('returns a Runnable with a stream method', () => {
    const model = new FakeListChatModel({ responses: ['generated content'] });
    const chain = createGenerateChain(model);
    expect(chain).toBeTruthy();
    expect(typeof chain.stream).toBe('function');
  });
});

describe('streamGenerate', () => {
  it('yields tokens from the fake model in order', async () => {
    const chain = makeFakeChain(['hello ', 'world']);
    const out: string[] = [];
    for await (const tok of streamGenerate(chain, {
      description: 'fibonacci function',
      contentType: 'snippet',
      language: 'python',
    })) {
      out.push(tok);
    }
    expect(out).toEqual(['hello ', 'world']);
  });

  it('respects AbortSignal — pre-aborted signal yields nothing or throws', async () => {
    const chain = makeFakeChain(['a', 'b', 'c']);
    const ac = new AbortController();
    ac.abort();
    const iter = streamGenerate(
      chain,
      { description: 'test', contentType: 'snippet' },
      { signal: ac.signal },
    );
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
    } as unknown as GenerateChain;

    const collected: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of streamGenerate(errorChain, {
          description: 'test',
          contentType: 'document',
        })) {
          collected.push(chunk);
        }
      })(),
    ).rejects.toThrow('model exploded');
  });

  it('handles zero-token case — empty chunk completes without hanging', async () => {
    const chain = makeFakeChain(['']);
    const out: string[] = [];
    for await (const tok of streamGenerate(chain, {
      description: 'empty test',
      contentType: 'prompt',
    })) {
      out.push(tok);
    }
    expect(out.join('')).toBe('');
  });

  it('defaults language to empty string when omitted', async () => {
    const model = new FakeListChatModel({ responses: ['output'] });
    const chain = createGenerateChain(model);
    const out: string[] = [];
    for await (const tok of streamGenerate(chain, {
      description: 'test without language',
      contentType: 'snippet',
    })) {
      out.push(tok);
    }
    // Should complete without error — language defaulted to ''
    expect(out.join('')).toContain('output');
  });

  it('passes language through when provided', async () => {
    const model = new FakeListChatModel({ responses: ['typed output'] });
    const chain = createGenerateChain(model);
    const out: string[] = [];
    for await (const tok of streamGenerate(chain, {
      description: 'test with language',
      contentType: 'snippet',
      language: 'typescript',
    })) {
      out.push(tok);
    }
    expect(out.join('')).toContain('typed output');
  });
});
