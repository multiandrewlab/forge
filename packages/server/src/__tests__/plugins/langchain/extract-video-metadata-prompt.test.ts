import { describe, it, expect } from 'vitest';
import {
  extractVideoMetadataPrompt,
  EXTRACT_VIDEO_METADATA_PROMPT_VERSION,
} from '../../../plugins/langchain/prompts/extract-video-metadata.js';

describe('extractVideoMetadataPrompt', () => {
  it('is a ChatPromptTemplate with system and human messages', () => {
    expect(extractVideoMetadataPrompt).toBeDefined();
    expect(extractVideoMetadataPrompt.promptMessages).toHaveLength(2);
  });

  it('exports the v1 prompt version constant', () => {
    expect(EXTRACT_VIDEO_METADATA_PROMPT_VERSION).toBe('v1');
  });

  it('renders with a transcript — output contains the transcript text', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'this video covers continuous integration with github actions',
      previousError: '',
    });
    expect(result).toContain('this video covers continuous integration with github actions');
  });

  it('system message frames the transcript as untrusted (prompt-injection defense)', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: '',
    });
    expect(result).toMatch(/untrusted/i);
    expect(result).toMatch(/ignore any instructions/i);
  });

  it('system message describes the required JSON output shape (title/description/tags)', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: '',
    });
    expect(result).toContain('title');
    expect(result).toContain('description');
    expect(result).toContain('tags');
  });

  it('system message instructs tag charset: lowercase + hyphens, no spaces', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: '',
    });
    expect(result).toMatch(/lowercase/i);
    expect(result).toMatch(/hyphen/i);
  });

  it('system message provides the adversarial / empty-transcript fallback (Untitled video)', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: '',
    });
    expect(result).toContain('Untitled video');
    expect(result).toContain('Transcript was unavailable.');
  });

  it('system message instructs strictly JSON output (no other text)', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: '',
    });
    expect(result).toMatch(/strictly json/i);
  });

  it('human message includes a "Transcript (untrusted):" header before the transcript', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'segment-from-vtt',
      previousError: '',
    });
    expect(result).toContain('Transcript (untrusted):');
    // Header precedes the transcript text.
    const headerIdx = result.indexOf('Transcript (untrusted):');
    const transcriptIdx = result.indexOf('segment-from-vtt');
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(transcriptIdx).toBeGreaterThan(headerIdx);
  });

  it('renders without throwing when transcript is empty', async () => {
    await expect(
      extractVideoMetadataPrompt.format({ transcript: '', previousError: '' }),
    ).resolves.toBeDefined();
  });

  it('includes the previousError text when one is provided (retry path)', async () => {
    const result = await extractVideoMetadataPrompt.format({
      transcript: 'hello',
      previousError: 'SyntaxError: Unexpected token a in JSON at position 0',
    });
    expect(result).toContain('SyntaxError: Unexpected token a in JSON at position 0');
  });
});
