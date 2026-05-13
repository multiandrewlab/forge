import { describe, it, expect } from 'vitest';
import { parseWebVttToTranscript, MAX_TRANSCRIPT_CHARS } from '../../lib/parse-webvtt.js';

describe('parseWebVttToTranscript', () => {
  it('empty returns empty', () => {
    expect(parseWebVttToTranscript('').text).toBe('');
    expect(parseWebVttToTranscript('').wasTruncated).toBe(false);
  });

  it('strips header and timing lines (HH:MM.mmm form)', () => {
    const vtt =
      'WEBVTT\n\n1\n00:00.000 --> 00:01.000\nHello world\n\n2\n00:01.000 --> 00:02.000\nGoodbye world\n';
    const r = parseWebVttToTranscript(vtt);
    expect(r.text).toBe('Hello world Goodbye world');
    expect(r.wasTruncated).toBe(false);
  });

  it('strips header and timing lines (HH:MM:SS.mmm form)', () => {
    const vtt =
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nLine one\n\n00:00:01.000 --> 00:00:02.000\nLine two\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Line one Line two');
  });

  it('strips styling tags', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:01.000\n<v Speaker>Hi <b>bold</b></v>\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Hi bold');
  });

  it('collapses adjacent duplicate lines', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n\n00:01.000 --> 00:02.000\nHi\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Hi');
  });

  it('does NOT collapse non-adjacent duplicates', () => {
    const vtt =
      'WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n\n00:01.000 --> 00:02.000\nOther\n\n00:02.000 --> 00:03.000\nHi\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Hi Other Hi');
  });

  it('strips NOTE blocks', () => {
    const vtt = 'WEBVTT\n\nNOTE this is a comment\n\n00:00.000 --> 00:01.000\nKeep me\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Keep me');
  });

  it('handles \\r\\n line endings', () => {
    const vtt = 'WEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHello\r\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Hello');
  });

  it('truncates when over maxChars with 60/20/20 layout', () => {
    const vtt = `WEBVTT\n\n00:00.000 --> 00:01.000\n${'a'.repeat(200)}\n`;
    const r = parseWebVttToTranscript(vtt, 60);
    expect(r.wasTruncated).toBe(true);
    expect(r.text).toContain('[...]');
    // 60 chars budget plus two ' [...] ' separators (~14 chars). Allow generous slack.
    expect(r.text.length).toBeLessThanOrEqual(80);
  });

  it('returns full text when joined length is exactly maxChars', () => {
    const exact = 'a'.repeat(20);
    const vtt = `WEBVTT\n\n00:00.000 --> 00:01.000\n${exact}\n`;
    const r = parseWebVttToTranscript(vtt, 20);
    expect(r.wasTruncated).toBe(false);
    expect(r.text).toBe(exact);
  });

  it('handles malformed cues without throwing', () => {
    const vtt = 'WEBVTT\n\nNOT_A_TIMING_LINE\ntext\n';
    expect(() => parseWebVttToTranscript(vtt)).not.toThrow();
  });

  it('ignores cue-identifier and stray lines outside cue bodies', () => {
    // The "1" line is a cue identifier (no timing yet → ignored); the timing
    // line starts the cue. The blank line between cues resets the in-cue flag.
    const vtt = 'WEBVTT\n\n1\n00:00.000 --> 00:01.000\nA\n\nstray\n2\n00:01.000 --> 00:02.000\nB\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('A B');
  });

  it('skips cue body lines that are only styling tags (empty after strip)', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:01.000\n<v Speaker></v>\nReal text\n';
    expect(parseWebVttToTranscript(vtt).text).toBe('Real text');
  });

  it('exports a sane default MAX_TRANSCRIPT_CHARS', () => {
    expect(MAX_TRANSCRIPT_CHARS).toBe(120_000);
  });

  it('uses MAX_TRANSCRIPT_CHARS as the default maxChars argument', () => {
    // A 50-char transcript with default maxChars must not be truncated.
    const vtt = `WEBVTT\n\n00:00.000 --> 00:01.000\n${'x'.repeat(50)}\n`;
    expect(parseWebVttToTranscript(vtt).wasTruncated).toBe(false);
  });
});
