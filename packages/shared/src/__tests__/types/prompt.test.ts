import { describe, it, expect } from 'vitest';
import type { PromptVariable } from '../../types/prompt';
import { extractVariables, assemblePrompt, extractRequiredVariables } from '../../types/prompt';

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

describe('extractRequiredVariables', () => {
  const v = (
    name: string,
    defaultValue: string | null | undefined = undefined,
  ): PromptVariable => ({
    id: `id-${name}`,
    postId: 'p1',
    name,
    placeholder: '',
    defaultValue: defaultValue ?? null,
    sortOrder: 0,
  });

  it('returns [] for empty content', () => {
    expect(extractRequiredVariables('', [])).toEqual([]);
  });

  it('returns [] when content has no {{vars}}', () => {
    expect(extractRequiredVariables('plain text', [v('name')])).toEqual([]);
  });

  it('marks {{var}} as required when defaultValue is undefined', () => {
    const vars: PromptVariable[] = [
      {
        id: 'id-name',
        postId: 'p1',
        name: 'name',
        placeholder: '',
        defaultValue: undefined as unknown as string | null,
        sortOrder: 0,
      },
    ];
    expect(extractRequiredVariables('Hi {{name}}!', vars)).toEqual(['name']);
  });

  it('marks {{var}} as required when defaultValue is null', () => {
    expect(extractRequiredVariables('Hi {{name}}!', [v('name', null)])).toEqual(['name']);
  });

  it("marks {{var}} as required when defaultValue is ''", () => {
    expect(extractRequiredVariables('Hi {{name}}!', [v('name', '')])).toEqual(['name']);
  });

  it('marks {{var}} as required when defaultValue is whitespace-only', () => {
    expect(extractRequiredVariables('Hi {{name}}!', [v('name', '   ')])).toEqual(['name']);
  });

  it("does NOT mark {{var}} as required when defaultValue is '0'", () => {
    expect(extractRequiredVariables('Hi {{name}}!', [v('name', '0')])).toEqual([]);
  });

  it('does NOT mark {{var}} as required when defaultValue is a non-empty string', () => {
    expect(extractRequiredVariables('Hi {{name}}!', [v('name', 'world')])).toEqual([]);
  });

  it('treats variable in content but missing from variables[] as required', () => {
    expect(extractRequiredVariables('Hi {{stranger}}!', [v('name', 'world')])).toEqual([
      'stranger',
    ]);
  });

  it('returns [] for variable in variables[] but not in content', () => {
    expect(extractRequiredVariables('plain', [v('unused', null)])).toEqual([]);
  });

  it('deduplicates duplicate {{var}} references', () => {
    expect(extractRequiredVariables('{{name}} and {{name}}', [v('name', null)])).toEqual(['name']);
  });

  it('ignores empty/whitespace-only placeholder names ({{   }})', () => {
    // {{   }} is a malformed template, not a "required '' variable" — must
    // not surface an empty-string key in `missing` (would render as a blank
    // chip in the UI and confuse error envelopes).
    expect(extractRequiredVariables('{{   }}', [])).toEqual([]);
    // Mixed: real var stays required, the blank placeholder is dropped.
    expect(extractRequiredVariables('Hi {{ }} {{name}}!', [v('name', null)])).toEqual(['name']);
  });
});
