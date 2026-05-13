import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable, RunnableLike } from '@langchain/core/runnables';
import { RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { videoMetadataSchema, videoTagSchema } from '@forge/shared';
import type { VideoMetadata } from '@forge/shared';
import { MOCK_SCRIPT_KEYS, withMockScript } from '../mock-scripts.js';
import { extractVideoMetadataPrompt } from '../prompts/extract-video-metadata.js';

/**
 * Thrown by {@link runExtractVideoMetadata} when both attempts (initial + one
 * retry) fail to produce JSON that satisfies {@link videoMetadataSchema} after
 * the tag-charset post-filter. Callers (e.g. `VideoPipelineService`) handle
 * this by marking the row `status='failed'` with `last_error='ai extraction
 * returned invalid output'`. The original underlying error is preserved on
 * `cause` for observability.
 */
export class AiExtractionFailedError extends Error {
  public readonly cause: unknown;
  constructor(cause: unknown) {
    super('ai extraction failed');
    this.name = 'AiExtractionFailedError';
    this.cause = cause;
  }
}

export interface ExtractVideoMetadataInput {
  transcript: string;
  /**
   * On a retry, the stringified error message from the previous attempt. The
   * prompt renders this verbatim before the transcript so the model can self-
   * correct. Undefined on the first attempt.
   */
  previousError?: string;
}

type PromptInput = {
  transcript: string;
  previousError: string;
};

export type ExtractVideoMetadataChain = Runnable<ExtractVideoMetadataInput, string>;

export interface CreateExtractVideoMetadataChainOptions {
  /**
   * Mock-script key seeded into AsyncLocalStorage for the duration of each
   * `.stream()` call. When the underlying model is `ChatMock`, this picks the
   * deterministic chunk list. With a real model the key is read but ignored.
   *
   * Default: `process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA ?? MOCK_SCRIPT_KEYS.videoMetadata`.
   */
  mockScriptKey?: string;
}

/**
 * Builds the LangChain runnable that converts a transcript into a JSON string
 * containing the proposed `{ title, description, tags }`. The runnable is
 * `prompt → model → StringOutputParser`, wrapped so each `.stream()` call
 * executes inside a `withMockScript(key, …)` AsyncLocalStorage context. The
 * AsyncLocalStorage seam is what lets a webhook-initiated or reconciler-
 * initiated call (which has no HTTP request context) feed a deterministic
 * script into `ChatMock` for tests and Bruno runs.
 *
 * Per project memory (`project_langchain_chain_stream_canonical.md`), the
 * caller must always use `chain.stream(...)`. `chain.invoke(...)` silently
 * breaks `ChatMock`, which throws "only supports streaming."
 */
export function createExtractVideoMetadataChain(
  model: BaseChatModel,
  opts: CreateExtractVideoMetadataChainOptions = {},
): ExtractVideoMetadataChain {
  const mockScriptKey =
    opts.mockScriptKey ??
    process.env.MOCK_SCRIPT_KEY_VIDEO_METADATA ??
    MOCK_SCRIPT_KEYS.videoMetadata;
  const fillDefaults = new RunnableLambda({
    func: (input: ExtractVideoMetadataInput): PromptInput => ({
      transcript: input.transcript,
      // The prompt renders previousError verbatim; an empty string is a no-op.
      previousError:
        input.previousError !== undefined && input.previousError.length > 0
          ? `Previous attempt failed with this error — please correct it: ${input.previousError}\n\n`
          : '',
    }),
  });
  const inner = fillDefaults
    .pipe(extractVideoMetadataPrompt as RunnableLike<PromptInput, unknown>)
    .pipe(model as RunnableLike)
    .pipe(new StringOutputParser());

  // Wrap the underlying runnable so every `.stream()` call seeds the mock-script
  // AsyncLocalStorage for the LIFETIME of the stream, not just for the call
  // that obtains the iterator. ChatMock pulls chunks lazily inside `for await`
  // — if we only seed the storage around `.stream(input)`, the key is gone by
  // the time the model body executes. We seed it around the entire drain.
  // We do NOT add an `invoke()` here — callers must always use `.stream()`
  // (project memory: `chain.invoke()` silently breaks ChatMock).
  return {
    async stream(input: ExtractVideoMetadataInput) {
      // Eagerly drain inside the withMockScript context, then return a simple
      // async iterator over the collected chunks. The video pipeline is not
      // latency-sensitive (it runs in the background) so we trade per-chunk
      // streaming for AsyncLocalStorage correctness.
      const collected = await withMockScript(mockScriptKey, async () => {
        const out: string[] = [];
        const stream = await inner.stream(input);
        for await (const chunk of stream) out.push(chunk);
        return out;
      });
      async function* replay() {
        for (const c of collected) yield c;
      }
      return replay();
    },
  } as unknown as ExtractVideoMetadataChain;
}

/**
 * Filters a tag array down to entries that match the video tag charset regex
 * (`^[a-z0-9][a-z0-9-]{0,39}$`). Invalid entries are silently dropped — they
 * are AI-generated suggestions, not user input, and the alternative (failing
 * the entire run because the model emitted one bad tag) loses too much value.
 * If every tag is dropped, the caller treats the run as a parse failure.
 */
function filterValidTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => {
    return typeof t === 'string' && videoTagSchema.safeParse(t).success;
  });
}

/**
 * Accumulates a complete chain stream into a single string. The chain emits
 * the model's textual JSON output across one or more chunks (project memory:
 * always `.stream()`, never `.invoke()` — `ChatMock._generate` throws).
 */
async function streamAndAccumulate(
  chain: ExtractVideoMetadataChain,
  input: ExtractVideoMetadataInput,
): Promise<string> {
  let acc = '';
  const stream = await chain.stream(input);
  for await (const chunk of stream) acc += chunk;
  return acc;
}

/**
 * Parses one chain attempt: JSON.parse → tag-charset post-filter → Zod parse.
 * A 0-tag survivor list after filtering is treated as a parse failure (so the
 * caller's retry kicks in); the constructed error includes a hint about why.
 */
function tryParseAttempt(raw: string): VideoMetadata {
  // JSON.parse throws SyntaxError (an Error subclass) on malformed input;
  // we let it propagate verbatim so the caller's retry path stringifies it.
  const candidate: unknown = JSON.parse(raw);
  if (candidate !== null && typeof candidate === 'object' && 'tags' in candidate) {
    const filtered = filterValidTags((candidate as { tags: unknown }).tags);
    if (filtered.length === 0) {
      throw new Error('no tags survived the charset filter');
    }
    (candidate as { tags: unknown }).tags = filtered;
  }
  const validation = videoMetadataSchema.safeParse(candidate);
  if (!validation.success) {
    throw new Error(`videoMetadataSchema validation failed: ${validation.error.message}`);
  }
  return validation.data;
}

/**
 * Streams the chain once, then on failure streams it again with the stringified
 * first-attempt error piped in as `previousError`. A second failure throws
 * `AiExtractionFailedError` (whose `cause` is the second error). This mirrors
 * the spec §7 retry policy — `withStructuredOutput` only retries malformed
 * JSON, not Zod failures, so we own the retry loop explicitly here.
 */
export async function runExtractVideoMetadata(
  chain: ExtractVideoMetadataChain,
  input: ExtractVideoMetadataInput,
): Promise<VideoMetadata> {
  let previousError: string;
  try {
    const raw1 = await streamAndAccumulate(chain, input);
    return tryParseAttempt(raw1);
  } catch (e1) {
    // Both error sources here — JSON.parse SyntaxError and our internal `new
    // Error(...)` throws — are Error subclasses, so `.message` is always
    // present. Stringify so the second attempt's prompt renders it verbatim.
    previousError = (e1 as Error).message;
  }
  try {
    const raw2 = await streamAndAccumulate(chain, { ...input, previousError });
    return tryParseAttempt(raw2);
  } catch (e2) {
    throw new AiExtractionFailedError(e2);
  }
}
