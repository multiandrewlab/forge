import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Runnable, RunnableLike } from '@langchain/core/runnables';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ContentType } from '@forge/shared';
import { generatePrompt } from '../prompts/generate.js';

export type GenerateInput = {
  description: string;
  contentType: ContentType;
  language?: string;
};

type PromptInput = {
  description: string;
  contentType: ContentType;
  language: string;
};

export type GenerateChain = Runnable<GenerateInput, string>;

export function createGenerateChain(model: BaseChatModel): GenerateChain {
  const defaultLanguage = new RunnableLambda({
    func: (input: GenerateInput): PromptInput => ({
      description: input.description,
      contentType: input.contentType,
      language: input.language ?? '',
    }),
  });

  return defaultLanguage
    .pipe(generatePrompt as RunnableLike<PromptInput, unknown>)
    .pipe(model as RunnableLike)
    .pipe(new StringOutputParser()) as unknown as GenerateChain;
}

export async function* streamGenerate(
  chain: GenerateChain,
  input: GenerateInput,
  options: { signal?: AbortSignal } = {},
): AsyncIterable<string> {
  const stream = await chain.stream(input, { signal: options.signal });
  for await (const chunk of stream) {
    // Sentinel chunks from mock-scripts.ts are control markers, not user-visible
    // tokens. The route layer turns thrown errors into SSE `event: error`.
    if (chunk === '[done]') {
      return;
    }
    const errorMatch = /^\[error:([a-z_]+)\]$/.exec(chunk);
    if (errorMatch) {
      // The regex's `[a-z_]+` ensures the capture group is always present.
      const code = errorMatch[1] as string;
      const messages: Record<string, string> = {
        rate_limit: 'Rate limit exceeded — too many requests. Please try again shortly.',
      };
      throw new Error(messages[code] ?? `mock_error:${code}`);
    }
    yield chunk;
  }
}
