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
    for (const text of chunks) {
      const message = new AIMessageChunk({ content: text });
      yield new ChatGenerationChunk({ text, message });
    }
  }

  async _generate(): Promise<ChatResult> {
    throw new Error('ChatMock only supports streaming. Use stream() not invoke().');
  }
}
