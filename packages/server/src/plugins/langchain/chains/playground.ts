import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { Runnable, RunnableLike } from '@langchain/core/runnables';

export type PlaygroundInput = { prompt: string };
export type PlaygroundChain = Runnable<PlaygroundInput, string>;

export function createPlaygroundChain(model: BaseChatModel): PlaygroundChain {
  const prompt = ChatPromptTemplate.fromMessages([['human', '{prompt}']]);

  return prompt
    .pipe(model as RunnableLike)
    .pipe(new StringOutputParser()) as unknown as PlaygroundChain;
}

export async function* streamPlayground(
  chain: PlaygroundChain,
  input: PlaygroundInput,
  options: { signal?: AbortSignal } = {},
): AsyncIterable<string> {
  const stream = await chain.stream(input, { signal: options.signal });
  for await (const chunk of stream) {
    yield chunk;
  }
}
