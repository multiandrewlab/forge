import { describe, it, expect } from 'vitest';
import type { PromptVariable } from '../../types/prompt';
import { extractVariables, assemblePrompt } from '../../types/prompt';

describe('PromptVariable type', () => {
  it('shape is correct with all fields', () => {
    const variable: PromptVariable = {
      id: 'v1',
      postId: 'p1',
      name: 'language',
      placeholder: 'Enter a language',
      defaultValue: 'TypeScript',
      sortOrder: 0,
    };
    expect(variable.id).toBe('v1');
    expect(variable.postId).toBe('p1');
    expect(variable.name).toBe('language');
    expect(variable.placeholder).toBe('Enter a language');
    expect(variable.defaultValue).toBe('TypeScript');
    expect(variable.sortOrder).toBe(0);
  });

  it('allows null for placeholder and defaultValue', () => {
    const variable: PromptVariable = {
      id: 'v2',
      postId: 'p1',
      name: 'topic',
      placeholder: null,
      defaultValue: null,
      sortOrder: 1,
    };
    expect(variable.placeholder).toBeNull();
    expect(variable.defaultValue).toBeNull();
  });
});

describe('extractVariables', () => {
  it('extracts a single variable', () => {
    expect(extractVariables('Hello {{name}}')).toEqual(['name']);
  });

  it('extracts multiple variables', () => {
    expect(extractVariables('{{greeting}} {{name}}, welcome to {{place}}')).toEqual([
      'greeting',
      'name',
      'place',
    ]);
  });

  it('deduplicates variables preserving first occurrence order', () => {
    expect(extractVariables('{{name}} is {{name}} and {{age}}')).toEqual(['name', 'age']);
  });

  it('trims whitespace inside braces', () => {
    expect(extractVariables('{{ name }}')).toEqual(['name']);
  });

  it('trims extra whitespace inside braces', () => {
    expect(extractVariables('{{  name  }}')).toEqual(['name']);
  });

  it('handles mixed whitespace variants as duplicates', () => {
    expect(extractVariables('{{name}} {{ name }} {{  name  }}')).toEqual(['name']);
  });

  it('returns empty array when no variables present', () => {
    expect(extractVariables('Hello world')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractVariables('')).toEqual([]);
  });

  it('preserves order of first occurrence', () => {
    expect(extractVariables('{{b}} {{a}} {{c}} {{a}} {{b}}')).toEqual(['b', 'a', 'c']);
  });

  it('handles variables with underscores', () => {
    expect(extractVariables('{{first_name}} {{last_name}}')).toEqual(['first_name', 'last_name']);
  });
});

describe('assemblePrompt', () => {
  it('replaces a single variable', () => {
    expect(assemblePrompt('Hello {{name}}', { name: 'World' })).toBe('Hello World');
  });

  it('replaces multiple variables', () => {
    const template = '{{greeting}} {{name}}, welcome to {{place}}';
    const variables = { greeting: 'Hi', name: 'Alice', place: 'Forge' };
    expect(assemblePrompt(template, variables)).toBe('Hi Alice, welcome to Forge');
  });

  it('replaces all occurrences of the same variable', () => {
    expect(assemblePrompt('{{name}} meets {{name}}', { name: 'Bob' })).toBe('Bob meets Bob');
  });

  it('leaves unfilled variables as normalized {{trimmedName}}', () => {
    expect(assemblePrompt('Hello {{name}}, age {{age}}', { name: 'Alice' })).toBe(
      'Hello Alice, age {{age}}',
    );
  });

  it('normalizes whitespace in unfilled variables', () => {
    expect(assemblePrompt('Hello {{  name  }}', {})).toBe('Hello {{name}}');
  });

  it('handles variables with whitespace in template', () => {
    expect(assemblePrompt('Hello {{ name }}', { name: 'World' })).toBe('Hello World');
  });

  it('returns template as-is when no variables in template', () => {
    expect(assemblePrompt('Hello world', { name: 'unused' })).toBe('Hello world');
  });

  it('returns empty string for empty template', () => {
    expect(assemblePrompt('', { name: 'unused' })).toBe('');
  });

  it('handles empty variables record', () => {
    expect(assemblePrompt('{{a}} and {{b}}', {})).toBe('{{a}} and {{b}}');
  });
});
