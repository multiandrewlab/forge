import { ref, type Ref } from 'vue';
import type { AiCompleteRequest } from '@forge/shared';
import { parseSseStream } from '@/lib/ai/sse-stream';

const DEBOUNCE_MS = 300;

export type UseAiCompleteReturn = {
  suggestion: Ref<string | null>;
  isLoading: Ref<boolean>;
  requestCompletion: (input: AiCompleteRequest) => void;
  acceptSuggestion: () => string | null;
  dismissSuggestion: () => void;
  cancel: () => void;
};

export function useAiComplete(): UseAiCompleteReturn {
  const suggestion = ref<string | null>(null);
  const isLoading = ref(false);
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  function cancel(): void {
    if (debounceHandle !== null) {
      clearTimeout(debounceHandle);
      debounceHandle = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
    isLoading.value = false;
  }

  function dismissSuggestion(): void {
    cancel();
    suggestion.value = null;
  }

  function acceptSuggestion(): string | null {
    const s = suggestion.value;
    suggestion.value = null;
    return s;
  }

  async function runFetch(input: AiCompleteRequest): Promise<void> {
    controller = new AbortController();
    isLoading.value = true;
    suggestion.value = null;
    let buffer = '';
    let errored = false;
    try {
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        errored = true;
        return;
      }
      for await (const evt of parseSseStream(res.body)) {
        if (evt.event === 'token' && isRecord(evt.data) && typeof evt.data.text === 'string') {
          buffer += evt.data.text;
          suggestion.value = buffer;
        } else if (evt.event === 'error') {
          errored = true;
          break;
        } else if (evt.event === 'done') {
          break;
        }
      }
    } catch {
      errored = true;
    } finally {
      if (errored) suggestion.value = null;
      isLoading.value = false;
      controller = null;
    }
  }

  function requestCompletion(input: AiCompleteRequest): void {
    cancel();
    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      void runFetch(input);
    }, DEBOUNCE_MS);
  }

  return { suggestion, isLoading, requestCompletion, acceptSuggestion, dismissSuggestion, cancel };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
