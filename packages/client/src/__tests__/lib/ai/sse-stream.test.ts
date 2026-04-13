import { describe, it, expect } from 'vitest';
import { parseSseStream } from '../../../lib/ai/sse-stream.js';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
}

describe('parseSseStream', () => {
  it('yields a single complete frame', async () => {
    const s = streamFrom(['event: token\ndata: {"text":"hi"}\n\n']);
    const events = [];
    for await (const e of parseSseStream(s)) events.push(e);
    expect(events).toEqual([{ event: 'token', data: { text: 'hi' } }]);
  });

  it('handles frames split across chunks', async () => {
    const s = streamFrom(['event: token\ndata: {"tex', 't":"hi"}\n\nevent: done\ndata: {}\n\n']);
    const events = [];
    for await (const e of parseSseStream(s)) events.push(e);
    expect(events).toEqual([
      { event: 'token', data: { text: 'hi' } },
      { event: 'done', data: {} },
    ]);
  });

  it('defaults event name to "message" when absent', async () => {
    const s = streamFrom(['data: {"x":1}\n\n']);
    const events = [];
    for await (const e of parseSseStream(s)) events.push(e);
    expect(events).toEqual([{ event: 'message', data: { x: 1 } }]);
  });

  it('skips frames with malformed JSON and continues', async () => {
    const s = streamFrom([
      'event: token\ndata: {broken\n\n',
      'event: token\ndata: {"text":"ok"}\n\n',
    ]);
    const events = [];
    for await (const e of parseSseStream(s)) events.push(e);
    expect(events).toEqual([{ event: 'token', data: { text: 'ok' } }]);
  });

  it('terminates cleanly on empty stream', async () => {
    const s = streamFrom([]);
    const events = [];
    for await (const e of parseSseStream(s)) events.push(e);
    expect(events).toEqual([]);
  });
});
