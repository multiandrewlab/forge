import { describe, it, expect, vi } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { videoMetadataSchema } from '@forge/shared';
import {
  createExtractVideoMetadataChain,
  runExtractVideoMetadata,
  AiExtractionFailedError,
  type ExtractVideoMetadataInput,
} from '../../../../plugins/langchain/chains/extract-video-metadata.js';
import { getCurrentMockScriptKey } from '../../../../plugins/langchain/mock-scripts.js';
import { ChatMock } from '../../../../plugins/langchain/mock-provider.js';

type ExtractChain = Runnable<ExtractVideoMetadataInput, string>;

/**
 * Builds a fake chain whose `.stream()` yields the next preset chunk-list and
 * records each call's `input` for assertion. If `outputs[i]` is an `Error`, it
 * is thrown from `.stream(...)`'s Promise.
 */
function makeFakeChain(outputs: Array<string | string[] | Error>): {
  chain: ExtractChain;
  streamSpy: ReturnType<typeof vi.fn>;
  calls: ExtractVideoMetadataInput[];
} {
  const calls: ExtractVideoMetadataInput[] = [];
  let i = 0;
  const streamSpy = vi.fn(async function stream(input: ExtractVideoMetadataInput) {
    calls.push(input);
    const next = outputs[i++];
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    const chunks = Array.isArray(next) ? next : [next ?? ''];
    async function* gen() {
      for (const c of chunks) yield c;
    }
    return Promise.resolve(gen());
  });
  const chain = { stream: streamSpy } as unknown as ExtractChain;
  return { chain, streamSpy, calls };
}

describe('createExtractVideoMetadataChain', () => {
  it('returns a Runnable exposing stream()', () => {
    const model = new FakeListChatModel({ responses: ['{}'] });
    const chain = createExtractVideoMetadataChain(model as unknown as BaseChatModel);
    expect(typeof chain.stream).toBe('function');
  });

  it('seeds withMockScript so ChatMock emits the default videoMetadata script', async () => {
    const model = new ChatMock();
    const chain = createExtractVideoMetadataChain(model);
    let acc = '';
    const stream = await chain.stream({ transcript: 'anything' });
    for await (const chunk of stream) acc += chunk;
    // The default videoMetadata script ends with [done]; the JSON parts
    // parse to a valid VideoMetadata.
    const jsonOnly = acc.replace(/\[done\]$/, '');
    const parsed: unknown = JSON.parse(jsonOnly);
    expect(videoMetadataSchema.safeParse(parsed).success).toBe(true);
  });

  it('honours the explicit mockScriptKey constructor option — emits the chosen script', async () => {
    const model = new ChatMock();
    const chain = createExtractVideoMetadataChain(model, {
      mockScriptKey: 'autocomplete-typescript-react',
    });
    let acc = '';
    const stream = await chain.stream({ transcript: 'anything' });
    for await (const chunk of stream) acc += chunk;
    // The autocomplete-typescript-react script emits a JSX <button> snippet —
    // verifies the mock-script seam routed the override to ChatMock.
    expect(acc).toContain('export const Button');
    expect(acc).toContain('[done]');
  });

  it('honours MOCK_SCRIPT_KEY_VIDEO_METADATA env var when no option is passed', async () => {
    const original = process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA;
    process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA = 'autocomplete-typescript-react';
    try {
      const model = new ChatMock();
      const chain = createExtractVideoMetadataChain(model);
      let acc = '';
      const stream = await chain.stream({ transcript: 'anything' });
      for await (const chunk of stream) acc += chunk;
      expect(acc).toContain('export const Button');
    } finally {
      if (original === undefined) {
        delete process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA;
      } else {
        process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA = original;
      }
    }
  });

  it('renders previousError into the prompt when set (retry context)', async () => {
    // Capture what the model receives by spying on a custom subclass of
    // ChatMock that records each rendered input.
    const seen: string[] = [];
    class RecordingChatMock extends ChatMock {
      override async *_streamResponseChunks(
        messages: unknown[],
        ...rest: unknown[]
      ): AsyncGenerator<unknown> {
        // The prompt's human-message rendering appears in the last message.
        seen.push(JSON.stringify(messages));
        // Delegate to the parent generator for normal output.
        const parent = super._streamResponseChunks(messages as never, ...(rest as [never, never?]));
        for await (const chunk of parent) yield chunk;
      }
    }
    const model = new RecordingChatMock();
    const chain = createExtractVideoMetadataChain(model);
    const stream = await chain.stream({
      transcript: 'transcript body',
      previousError: 'SyntaxError: Unexpected token',
    });
    const acc: string[] = [];
    for await (const chunk of stream) acc.push(chunk);
    // The retry context should appear in the rendered prompt.
    expect(seen.join('')).toContain('SyntaxError: Unexpected token');
    expect(seen.join('')).toContain('Previous attempt failed');
  });

  it('clears the AsyncLocalStorage context after the stream completes', async () => {
    const model = new ChatMock();
    const chain = createExtractVideoMetadataChain(model);
    const stream = await chain.stream({ transcript: 'anything' });
    const drained: string[] = [];
    for await (const chunk of stream) drained.push(chunk);
    expect(drained.length).toBeGreaterThan(0);
    expect(getCurrentMockScriptKey()).toBeUndefined();
  });
});

describe('AiExtractionFailedError', () => {
  it('is an Error subclass that carries a cause', () => {
    const cause = new Error('upstream zod failure');
    const err = new AiExtractionFailedError(cause);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiExtractionFailedError);
    expect(err.name).toBe('AiExtractionFailedError');
    expect(err.cause).toBe(cause);
    expect(err.message).toBe('ai extraction failed');
  });
});

describe('runExtractVideoMetadata', () => {
  const validJson = JSON.stringify({
    title: 'Intro to CI',
    description: 'A short walkthrough of continuous integration with GitHub Actions.',
    tags: ['ci', 'github-actions', 'devops'],
  });

  it('returns parsed metadata on a valid first attempt and only calls stream once', async () => {
    const { chain, streamSpy, calls } = makeFakeChain([validJson]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result).toEqual({
      title: 'Intro to CI',
      description: 'A short walkthrough of continuous integration with GitHub Actions.',
      tags: ['ci', 'github-actions', 'devops'],
    });
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(calls[0]?.previousError).toBeUndefined();
  });

  it('accumulates streamed chunks before JSON.parse', async () => {
    const chunks = [validJson.slice(0, 20), validJson.slice(20, 50), validJson.slice(50)];
    const { chain } = makeFakeChain([chunks]);
    const result = await runExtractVideoMetadata(chain, { transcript: 't' });
    expect(result.title).toBe('Intro to CI');
  });

  it('strips the trailing [done] sentinel before JSON.parse', async () => {
    // ChatMock and other project chains terminate streams with a `[done]`
    // marker that JSON-parsing callers must drop. Without the strip, the
    // mock-script-driven video pipeline returns 502 AI_EXTRACTION_FAILED.
    const { chain } = makeFakeChain([[validJson, '[done]']]);
    const result = await runExtractVideoMetadata(chain, { transcript: 't' });
    expect(result.title).toBe('Intro to CI');
  });

  it('also strips [done] with surrounding whitespace', async () => {
    const { chain } = makeFakeChain([[validJson, '  [done]\n']]);
    const result = await runExtractVideoMetadata(chain, { transcript: 't' });
    expect(result.title).toBe('Intro to CI');
  });

  it('retries once on invalid JSON, populating previousError on the second call', async () => {
    const { chain, streamSpy, calls } = makeFakeChain(['not-json-at-all', validJson]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result.title).toBe('Intro to CI');
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(calls[0]?.previousError).toBeUndefined();
    expect(calls[1]?.previousError).toBeDefined();
    expect(typeof calls[1]?.previousError).toBe('string');
    expect((calls[1]?.previousError ?? '').length).toBeGreaterThan(0);
  });

  it('throws AiExtractionFailedError after two invalid-JSON failures', async () => {
    const { chain, streamSpy } = makeFakeChain(['nope', 'still-nope']);
    await expect(
      runExtractVideoMetadata(chain, { transcript: 'transcript text' }),
    ).rejects.toBeInstanceOf(AiExtractionFailedError);
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });

  it('retries once on Zod failure (valid JSON, invalid shape) then succeeds on retry', async () => {
    const zodBad = JSON.stringify({ title: 'ok', description: 'ok desc' /* tags missing */ });
    const { chain, streamSpy, calls } = makeFakeChain([zodBad, validJson]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result.title).toBe('Intro to CI');
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(calls[1]?.previousError).toBeDefined();
  });

  it('drops tags that fail the charset regex BEFORE Zod validation; valid tags survive', async () => {
    const mixedTags = JSON.stringify({
      title: 'Tag charset test',
      description: 'Description for tag charset test, long enough.',
      tags: [
        'good-tag',
        'UPPERCASE', // fails regex (uppercase)
        'has space', // fails regex (space)
        'too$weird', // fails regex (special char)
        'kept2',
      ],
    });
    const { chain, streamSpy } = makeFakeChain([mixedTags]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result.tags).toEqual(['good-tag', 'kept2']);
    expect(streamSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a non-array tags field as no-tags (filter-then-empty) and retries', async () => {
    const tagsNotArray = JSON.stringify({
      title: 'Non-array tags',
      description: 'A description with the right length to satisfy the schema.',
      tags: 'not-an-array', // string, not array
    });
    const { chain, streamSpy, calls } = makeFakeChain([tagsNotArray, validJson]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result.tags).toEqual(['ci', 'github-actions', 'devops']);
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(calls[1]?.previousError).toBeDefined();
  });

  it('treats a tag-list with ALL bad tags as a parse failure and retries (then succeeds)', async () => {
    const allBadTags = JSON.stringify({
      title: 'Bad tags only',
      description: 'A description that meets the min length requirement easily.',
      tags: ['UPPER', 'has space', '$$$'],
    });
    const { chain, streamSpy, calls } = makeFakeChain([allBadTags, validJson]);
    const result = await runExtractVideoMetadata(chain, { transcript: 'transcript text' });
    expect(result.tags).toEqual(['ci', 'github-actions', 'devops']);
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(calls[1]?.previousError).toBeDefined();
  });

  it('treats a tag-list with ALL bad tags then a second all-bad-tags response as AiExtractionFailedError', async () => {
    const allBadTags = JSON.stringify({
      title: 'Bad tags only',
      description: 'A description that meets the min length requirement easily.',
      tags: ['UPPER', 'has space', '$$$'],
    });
    const { chain, streamSpy } = makeFakeChain([allBadTags, allBadTags]);
    await expect(runExtractVideoMetadata(chain, { transcript: 't' })).rejects.toBeInstanceOf(
      AiExtractionFailedError,
    );
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });

  it('uses chain.stream (NOT chain.invoke) — invoking the chain object never calls invoke', async () => {
    const { chain, streamSpy } = makeFakeChain([validJson]);
    // Augment with an invoke that, if called, would explode the test.
    const invokeSpy = vi.fn(() => {
      throw new Error('chain.invoke must not be called — project memory rule');
    });
    (chain as unknown as { invoke: typeof invokeSpy }).invoke = invokeSpy;
    await runExtractVideoMetadata(chain, { transcript: 't' });
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
