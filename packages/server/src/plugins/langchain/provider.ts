import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ChatMock } from './mock-provider.js';

export function createChatModel(): BaseChatModel {
  const provider = process.env.LLM_PROVIDER ?? 'ollama';
  const model = process.env.LLM_MODEL ?? 'gemma4';

  switch (provider) {
    case 'ollama':
      return new ChatOllama({
        baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434',
        model,
      }) as unknown as BaseChatModel;
    case 'openai':
      return new ChatOpenAI({
        modelName: model,
        openAIApiKey: process.env.OPENAI_API_KEY,
        streaming: true,
      }) as unknown as BaseChatModel;
    case 'vertex':
      return new ChatVertexAI({ model }) as unknown as BaseChatModel;
    case 'mock':
      if (process.env.NODE_ENV?.trim() === 'production') {
        throw new Error(
          'LLM_PROVIDER=mock refused: NODE_ENV=production. Mock provider must never run in production.',
        );
      }
      return new ChatMock({}) as unknown as BaseChatModel;
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
