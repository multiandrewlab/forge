import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockScripts,
  DEFAULT_SCRIPT_KEY,
  resolveMockScript,
} from '../../../plugins/langchain/mock-scripts.js';

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
