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
});
