import { AsyncLocalStorage } from 'node:async_hooks';
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessageChunk } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { resolveMockScript } from './mock-scripts.js';

export const mockScriptStorage = new AsyncLocalStorage<string>();

export class ChatMock extends BaseChatModel<BaseChatModelCallOptions> {
  constructor(fields: BaseChatModelParams = {}) {
    super(fields);
  }

  _llmType(): string {
    return 'mock';
  }

  override async *_streamResponseChunks(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const key = mockScriptStorage.getStore();
    const chunks = resolveMockScript(key);
    // The `mid-stream-cancel` and `generate-readme-short` scripts exist for
    // e2e specs that observe the streaming/loading UI lifecycle. Without an
    // inter-chunk pause the responses complete before Playwright can observe
    // the loading state. Pace these streams so the loading state is observable
    // for ~400-800ms total — fast enough to keep tests snappy, slow enough
    // that abort/loading checks reliably catch chunks in flight.
    const PACED_SCRIPTS = new Set(['mid-stream-cancel', 'generate-readme-short']);
    const perChunkDelayMs = key !== undefined && PACED_SCRIPTS.has(key) ? 150 : 0;
    for (const text of chunks) {
      if (perChunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, perChunkDelayMs));
      }
      const message = new AIMessageChunk({ content: text });
      yield new ChatGenerationChunk({ text, message });
    }
  }

  async _generate(): Promise<ChatResult> {
    throw new Error('ChatMock only supports streaming. Use stream() not invoke().');
  }
}
