import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiSearchFiltersSchema, videoMetadataSchema } from '@forge/shared';
import {
  mockScripts,
  DEFAULT_SCRIPT_KEY,
  resolveMockScript,
  MOCK_SCRIPT_KEYS,
  withMockScript,
  getCurrentMockScriptKey,
} from '../../../plugins/langchain/mock-scripts.js';
import { ChatMock, mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';
import { createSearchChain } from '../../../plugins/langchain/chains/search.js';

describe('mock-scripts registry', () => {
  it('exposes a default script key', () => {
    expect(DEFAULT_SCRIPT_KEY).toBe('default');
    expect(mockScripts[DEFAULT_SCRIPT_KEY]).toBeDefined();
    expect(mockScripts[DEFAULT_SCRIPT_KEY].length).toBeGreaterThan(0);
  });

  it('exposes the named scripts the design references', () => {
    expect(mockScripts['autocomplete-typescript-react']).toBeDefined();
    expect(mockScripts['generate-readme-short']).toBeDefined();
    expect(mockScripts['error-rate-limit']).toBeDefined();
    expect(mockScripts['mid-stream-cancel']).toBeDefined();
  });

  it('every script chunk is a non-empty string', () => {
    for (const [key, chunks] of Object.entries(mockScripts)) {
      expect(chunks.length, `script ${key} must have at least one chunk`).toBeGreaterThan(0);
      for (const c of chunks) {
        expect(typeof c).toBe('string');
        expect(c.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('resolveMockScript', () => {
  const original = { ...process.env };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...original };
  });

  it('returns the requested script when it exists, no warn', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript('autocomplete-typescript-react')).toBe(
      mockScripts['autocomplete-typescript-react'],
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns the default script when the key is undefined, no warn', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript(undefined)).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits console.warn for unknown key when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript('nonexistent-key')).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/unknown.*X-Mock-Script.*nonexistent-key/i),
    );
  });

  it('does NOT emit console.warn when NODE_ENV=production (silent fallback)', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveMockScript('nonexistent-key')).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('search-resolves-to-typescript-tag mock script (Issue #49)', () => {
  const KEY = 'search-resolves-to-typescript-tag';

  it('is registered in the mock-scripts registry', () => {
    expect(mockScripts[KEY]).toBeDefined();
    expect(mockScripts[KEY].length).toBeGreaterThan(0);
  });

  it('chunks concatenate to valid JSON that parses to AiSearchFilters with tags=["typescript"]', () => {
    const assembled = mockScripts[KEY].join('');
    const parsed: unknown = JSON.parse(assembled);
    const validation = aiSearchFiltersSchema.safeParse(parsed);
    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data).toEqual({
        tags: ['typescript'],
        language: null,
        contentType: null,
        textQuery: 'typescript',
      });
    }
  });

  it('streams via ChatMock + StringOutputParser to produce the deterministic JSON', async () => {
    // Mirrors the structure search chain runs through: prompt → model → string
    // parser. Since runSearchChain uses .invoke() not .stream() (a separate
    // concern owned by WU2), we exercise the script's streaming-assembly path
    // directly via the chain's stream() so this test stays scoped to WU7.
    const model = new ChatMock({});
    const chain = createSearchChain(model);
    const collected: string[] = [];
    await mockScriptStorage.run(KEY, async () => {
      const stream = await chain.stream({ query: 'typescript' });
      for await (const chunk of stream) collected.push(chunk);
    });
    const assembled = collected.join('');
    const parsed: unknown = JSON.parse(assembled);
    const validation = aiSearchFiltersSchema.safeParse(parsed);
    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data).toEqual({
        tags: ['typescript'],
        language: null,
        contentType: null,
        textQuery: 'typescript',
      });
    }
  });
});

describe('MOCK_SCRIPT_KEYS registry (Issue #102 — video metadata bridge)', () => {
  it('exposes a stable videoMetadata key constant', () => {
    expect(MOCK_SCRIPT_KEYS.videoMetadata).toBe('video-metadata');
  });

  it('registers the videoMetadata script under that key', () => {
    expect(mockScripts[MOCK_SCRIPT_KEYS.videoMetadata]).toBeDefined();
    expect(mockScripts[MOCK_SCRIPT_KEYS.videoMetadata].length).toBeGreaterThan(0);
  });

  it('videoMetadata chunks concatenate to valid JSON parsable by videoMetadataSchema', () => {
    const assembled = mockScripts[MOCK_SCRIPT_KEYS.videoMetadata]
      .filter((c) => c !== '[done]')
      .join('');
    const parsed: unknown = JSON.parse(assembled);
    const validation = videoMetadataSchema.safeParse(parsed);
    expect(validation.success).toBe(true);
  });

  it('videoMetadata script ends with the [done] sentinel', () => {
    const chunks = mockScripts[MOCK_SCRIPT_KEYS.videoMetadata];
    expect(chunks[chunks.length - 1]).toBe('[done]');
  });
});

describe('withMockScript / getCurrentMockScriptKey', () => {
  it('getCurrentMockScriptKey returns undefined outside any withMockScript context', () => {
    expect(getCurrentMockScriptKey()).toBeUndefined();
  });

  it('withMockScript seeds the key and getCurrentMockScriptKey reads it inside the callback', async () => {
    const observed = await withMockScript('autocomplete-typescript-react', async () => {
      return getCurrentMockScriptKey();
    });
    expect(observed).toBe('autocomplete-typescript-react');
  });

  it('withMockScript propagates the key into ChatMock streaming (uses the same storage)', async () => {
    const KEY = MOCK_SCRIPT_KEYS.videoMetadata;
    const model = new ChatMock({});
    const assembled = await withMockScript(KEY, async () => {
      const collected: string[] = [];
      const stream = await model.stream([]);
      for await (const chunk of stream) {
        collected.push(String(chunk.content));
      }
      return collected.join('');
    });
    // The videoMetadata script's non-sentinel chunks concatenate to valid JSON.
    const jsonPart = assembled.replace(/\[done\]$/, '');
    const parsed: unknown = JSON.parse(jsonPart);
    expect(videoMetadataSchema.safeParse(parsed).success).toBe(true);
  });

  it('withMockScript context does NOT leak outside the callback', async () => {
    await withMockScript('autocomplete-typescript-react', async () => {
      expect(getCurrentMockScriptKey()).toBe('autocomplete-typescript-react');
    });
    expect(getCurrentMockScriptKey()).toBeUndefined();
  });

  it('withMockScript returns the callback return value', async () => {
    const result = await withMockScript('autocomplete-typescript-react', async () => 42);
    expect(result).toBe(42);
  });

  it('withMockScript propagates errors thrown inside the callback', async () => {
    await expect(
      withMockScript('autocomplete-typescript-react', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // ...and still clears the storage afterwards.
    expect(getCurrentMockScriptKey()).toBeUndefined();
  });

  it('nested withMockScript replaces the key inside the inner scope and restores on exit', async () => {
    await withMockScript('autocomplete-typescript-react', async () => {
      expect(getCurrentMockScriptKey()).toBe('autocomplete-typescript-react');
      await withMockScript('generate-readme-short', async () => {
        expect(getCurrentMockScriptKey()).toBe('generate-readme-short');
      });
      expect(getCurrentMockScriptKey()).toBe('autocomplete-typescript-react');
    });
  });
});
