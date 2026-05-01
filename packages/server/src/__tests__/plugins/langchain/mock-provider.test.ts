import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { ChatMock, mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';
import { mockScripts } from '../../../plugins/langchain/mock-scripts.js';

describe('ChatMock', () => {
  it('streams the chunks of the active mock script via AsyncLocalStorage', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];

    await mockScriptStorage.run('autocomplete-typescript-react', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });

    expect(collected).toEqual(mockScripts['autocomplete-typescript-react']);
  });

  it('falls back to the default script when no key is in AsyncLocalStorage', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    const stream = await model.stream([new HumanMessage('anything')]);
    for await (const chunk of stream) {
      collected.push(typeof chunk.content === 'string' ? chunk.content : '');
    }
    expect(collected).toEqual(mockScripts['default']);
  });

  it('falls back to the default script when the key in storage is unknown', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    await mockScriptStorage.run('definitely-not-a-real-key', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });
    expect(collected).toEqual(mockScripts['default']);
  });

  it('reports llmType "mock"', () => {
    expect(new ChatMock({})._llmType()).toBe('mock');
  });

  it('_generate throws — only streaming is supported', async () => {
    const model = new ChatMock({});
    await expect(model.invoke([new HumanMessage('anything')])).rejects.toThrow(
      /only supports streaming/i,
    );
  });

  it('paces the `mid-stream-cancel` script with a small per-chunk delay so e2e specs can abort mid-stream', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    const start = Date.now();
    await mockScriptStorage.run('mid-stream-cancel', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });
    const elapsed = Date.now() - start;
    expect(collected).toEqual(mockScripts['mid-stream-cancel']);
    // Two chunks * ~150ms each = >=300ms total; allow generous lower bound
    // for slow CI without coupling to the exact delay constant.
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });

  it('paces the `generate-readme-short` script so e2e specs can observe loading state', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    const start = Date.now();
    await mockScriptStorage.run('generate-readme-short', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });
    const elapsed = Date.now() - start;
    expect(collected).toEqual(mockScripts['generate-readme-short']);
    // 4 chunks * ~150ms each = >=600ms total; allow generous lower bound for CI.
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });
});
