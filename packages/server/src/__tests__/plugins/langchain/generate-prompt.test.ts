import { describe, it, expect } from 'vitest';
import { generatePrompt } from '../../../plugins/langchain/prompts/generate.js';

describe('generatePrompt', () => {
  it('renders snippet with language — output contains language and description', async () => {
    const result = await generatePrompt.format({
      contentType: 'snippet',
      language: 'python',
      description: 'fibonacci',
    });
    expect(result).toContain('python');
    expect(result).toContain('fibonacci');
  });

  it('renders prompt without language — does not throw', async () => {
    const result = await generatePrompt.format({
      contentType: 'prompt',
      language: '',
      description: 'summarize article',
    });
    expect(result).toContain('summarize article');
  });

  it('renders document without language — contains document-oriented guidance', async () => {
    const result = await generatePrompt.format({
      contentType: 'document',
      language: '',
      description: 'readme for X',
    });
    expect(result).toContain('readme for X');
    // System message should contain document-oriented guidance keyword
    expect(result.toLowerCase()).toMatch(/markdown|documentation/);
  });

  it('literal braces in system message do not throw Missing variable (snippet)', async () => {
    await expect(
      generatePrompt.format({
        contentType: 'snippet',
        language: 'typescript',
        description: 'hello world',
      }),
    ).resolves.toBeDefined();
  });

  it('literal braces in system message do not throw Missing variable (prompt)', async () => {
    await expect(
      generatePrompt.format({
        contentType: 'prompt',
        language: '',
        description: 'write a prompt',
      }),
    ).resolves.toBeDefined();
  });

  it('literal braces in system message do not throw Missing variable (document)', async () => {
    await expect(
      generatePrompt.format({
        contentType: 'document',
        language: '',
        description: 'API docs',
      }),
    ).resolves.toBeDefined();
  });
});
