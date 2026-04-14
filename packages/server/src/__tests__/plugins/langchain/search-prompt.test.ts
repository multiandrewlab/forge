import { describe, it, expect } from 'vitest';
import { searchPrompt } from '../../../plugins/langchain/prompts/search.js';

describe('searchPrompt', () => {
  it('is a ChatPromptTemplate with system and human messages', () => {
    expect(searchPrompt).toBeDefined();
    expect(searchPrompt.promptMessages).toHaveLength(2);
  });

  it('renders with a query — output contains the query text', async () => {
    const result = await searchPrompt.format({
      query: 'python scripts for parsing CSV files',
    });
    expect(result).toContain('python scripts for parsing CSV files');
  });

  it('system message instructs JSON output with required fields', async () => {
    const result = await searchPrompt.format({ query: 'test query' });
    expect(result).toContain('tags');
    expect(result).toContain('language');
    expect(result).toContain('contentType');
    expect(result).toContain('textQuery');
  });

  it('system message includes examples', async () => {
    const result = await searchPrompt.format({ query: 'test query' });
    expect(result).toContain('csv');
    expect(result).toContain('snippet');
  });

  it('renders with a different query — output contains that query', async () => {
    const result = await searchPrompt.format({
      query: 'how to use React hooks',
    });
    expect(result).toContain('how to use React hooks');
  });

  it('system message instructs to output ONLY valid JSON', async () => {
    const result = await searchPrompt.format({ query: 'test' });
    expect(result).toMatch(/only valid json/i);
  });

  it('does not throw when query is empty string', async () => {
    await expect(searchPrompt.format({ query: '' })).resolves.toBeDefined();
  });
});
