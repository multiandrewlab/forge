// WebVTT → flat-transcript pre-processor for the video-AI extraction pipeline
// (issue #102, spec §7.2).
//
// Cloudflare Stream emits captions as WebVTT. The AI metadata extractor needs a
// flat text blob — without timing lines, cue identifiers, or inline styling —
// bounded to a sane character budget so the LLM call stays within token
// limits and cost projections. This module is intentionally pure (no I/O) so
// it is trivial to unit-test against fixture WebVTT strings.

/** Default maximum transcript length, in characters, before truncation kicks in. */
export const MAX_TRANSCRIPT_CHARS = 120_000;

// A WebVTT timing line — `HH:MM.mmm --> HH:MM.mmm` or `HH:MM:SS.mmm --> ...`.
// We tolerate both forms because CF Stream historically has emitted both.
const TIMING_RE = /^\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->/;

/**
 * Parse a WebVTT caption blob into a flat transcript suitable for LLM input.
 *
 * Behavior:
 *  - Strips the `WEBVTT` header, cue-identifier lines, timing lines, and
 *    `NOTE` blocks.
 *  - Strips simple inline styling tags (`<v Speaker>`, `<b>`, …).
 *  - Collapses adjacent duplicate cue lines — CF sometimes emits the same line
 *    twice across overlapping cues.
 *  - Truncates with a 60/20/20 (front/middle/back) layout and `[...]` markers
 *    when the joined text exceeds `maxChars`.
 *  - Is tolerant of malformed input — never throws.
 */
export function parseWebVttToTranscript(
  vtt: string,
  maxChars: number = MAX_TRANSCRIPT_CHARS,
): { text: string; wasTruncated: boolean } {
  const lines = vtt.split(/\r?\n/);
  const cueLines: string[] = [];
  let inCue = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      // Blank line ends the current cue body.
      inCue = false;
      continue;
    }
    if (line === 'WEBVTT' || line.startsWith('NOTE')) continue;
    if (TIMING_RE.test(line)) {
      inCue = true;
      continue;
    }
    if (!inCue) continue;

    // Strip simple styling tags (`<v Speaker>`, `<b>`, …) and trim.
    const stripped = line.replace(/<[^>]+>/g, '').trim();
    if (!stripped) continue;
    if (cueLines.length === 0 || cueLines[cueLines.length - 1] !== stripped) {
      cueLines.push(stripped);
    }
  }

  const joined = cueLines.join(' ').trim();
  if (joined.length <= maxChars) return { text: joined, wasTruncated: false };

  // 60/20/20 layout — keep the front for context, sample the middle, and
  // preserve the tail so closing remarks land in the LLM prompt.
  const front = Math.floor(maxChars * 0.6);
  const mid = Math.floor(maxChars * 0.2);
  const back = maxChars - front - mid;
  const midStart = Math.floor(joined.length * 0.4);
  return {
    text: `${joined.slice(0, front)} [...] ${joined.slice(midStart, midStart + mid)} [...] ${joined.slice(-back)}`,
    wasTruncated: true,
  };
}
