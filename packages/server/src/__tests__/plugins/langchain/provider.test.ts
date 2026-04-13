import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@langchain/community/chat_models/ollama', () => ({
  ChatOllama: vi.fn().mockImplementation((opts) => ({ __kind: 'ollama', opts })),
}));
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ __kind: 'openai', opts })),
}));
vi.mock('@langchain/google-vertexai', () => ({
  ChatVertexAI: vi.fn().mockImplementation((opts) => ({ __kind: 'vertex', opts })),
}));

import { createChatModel } from '../../../plugins/langchain/provider.js';

describe('createChatModel', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns ChatOllama by default', () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    const model = createChatModel() as unknown as { __kind: string; opts: Record<string, unknown> };
    expect(model.__kind).toBe('ollama');
    expect(model.opts.model).toBe('gemma4');
    expect(model.opts.baseUrl).toBe('http://ollama:11434');
  });

  it('respects LLM_MODEL and OLLAMA_BASE_URL overrides', () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_MODEL = 'llama3';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    const model = createChatModel() as unknown as { opts: Record<string, unknown> };
    expect(model.opts.model).toBe('llama3');
    expect(model.opts.baseUrl).toBe('http://localhost:11434');
  });

  it('returns ChatOpenAI for provider=openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_API_KEY = 'sk-test';
    const model = createChatModel() as unknown as { __kind: string; opts: Record<string, unknown> };
    expect(model.__kind).toBe('openai');
    expect(model.opts.modelName).toBe('gpt-4o-mini');
    expect(model.opts.streaming).toBe(true);
  });

  it('returns ChatVertexAI for provider=vertex', () => {
    process.env.LLM_PROVIDER = 'vertex';
    process.env.LLM_MODEL = 'gemini-1.5-pro';
    const model = createChatModel() as unknown as { __kind: string; opts: Record<string, unknown> };
    expect(model.__kind).toBe('vertex');
    expect(model.opts.model).toBe('gemini-1.5-pro');
  });

  it('throws on unknown provider', () => {
    process.env.LLM_PROVIDER = 'bogus';
    expect(() => createChatModel()).toThrow(/Unknown LLM provider: bogus/);
  });
});
