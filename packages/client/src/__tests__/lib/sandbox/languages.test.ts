import { describe, it, expect } from 'vitest';
import {
  SANDBOX_LANGUAGES,
  isSandboxLanguage,
  languageToExtension,
  extensionToLanguage,
} from '../../../lib/sandbox/languages.js';

describe('SANDBOX_LANGUAGES', () => {
  it('contains exactly python, javascript, typescript', () => {
    expect([...SANDBOX_LANGUAGES]).toEqual(['python', 'javascript', 'typescript']);
  });

  it('has length 3', () => {
    expect(SANDBOX_LANGUAGES).toHaveLength(3);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SANDBOX_LANGUAGES)).toBe(true);
  });
});

describe('isSandboxLanguage', () => {
  it('returns true for python', () => {
    expect(isSandboxLanguage('python')).toBe(true);
  });

  it('returns true for javascript', () => {
    expect(isSandboxLanguage('javascript')).toBe(true);
  });

  it('returns true for typescript', () => {
    expect(isSandboxLanguage('typescript')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSandboxLanguage(null)).toBe(false);
  });

  it('returns false for go', () => {
    expect(isSandboxLanguage('go')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSandboxLanguage('')).toBe(false);
  });
});

describe('languageToExtension', () => {
  it('maps python to .py', () => {
    expect(languageToExtension('python')).toBe('.py');
  });

  it('maps javascript to .js', () => {
    expect(languageToExtension('javascript')).toBe('.js');
  });

  it('maps typescript to .ts', () => {
    expect(languageToExtension('typescript')).toBe('.ts');
  });
});

describe('extensionToLanguage', () => {
  it('maps .py to python', () => {
    expect(extensionToLanguage('.py')).toBe('python');
  });

  it('maps .js to javascript', () => {
    expect(extensionToLanguage('.js')).toBe('javascript');
  });

  it('maps .ts to typescript', () => {
    expect(extensionToLanguage('.ts')).toBe('typescript');
  });

  it('maps .mjs to javascript', () => {
    expect(extensionToLanguage('.mjs')).toBe('javascript');
  });

  it('maps .mts to typescript', () => {
    expect(extensionToLanguage('.mts')).toBe('typescript');
  });

  it('returns null for unsupported extension .go', () => {
    expect(extensionToLanguage('.go')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extensionToLanguage('')).toBeNull();
  });
});
