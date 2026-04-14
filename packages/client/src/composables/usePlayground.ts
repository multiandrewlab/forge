import { ref, type Ref } from 'vue';
import type { PromptVariable } from '@forge/shared';
import { apiFetch } from '@/lib/api';
import { parseSseStream } from '@/lib/ai/sse-stream';

export type UsePlaygroundReturn = {
  variables: Ref<PromptVariable[]>;
  isRunning: Ref<boolean>;
  error: Ref<string | null>;
  output: Ref<string>;
  fetchVariables: (postId: string) => Promise<void>;
  run: (postId: string, vars: Record<string, string>) => Promise<void>;
  stop: () => void;
};

export function usePlayground(): UsePlaygroundReturn {
  const variables = ref<PromptVariable[]>([]);
  const isRunning = ref(false);
  const error = ref<string | null>(null);
  const output = ref('');
  let controller: AbortController | null = null;

  async function fetchVariables(postId: string): Promise<void> {
    error.value = null;
    try {
      const res = await apiFetch(`/api/posts/${postId}/variables`);
      if (!res.ok) {
        error.value = 'Failed to load variables';
        return;
      }
      const data = (await res.json()) as { variables: PromptVariable[] };
      variables.value = data.variables;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load variables';
    }
  }

  function stop(): void {
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  async function run(postId: string, vars: Record<string, string>): Promise<void> {
    stop();
    controller = new AbortController();
    isRunning.value = true;
    error.value = null;
    output.value = '';

    try {
      const res = await apiFetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, variables: vars }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        error.value = 'Request failed';
      } else {
        for await (const evt of parseSseStream(res.body)) {
          if (evt.event === 'token' && isRecord(evt.data) && typeof evt.data.text === 'string') {
            output.value += evt.data.text;
          } else if (evt.event === 'error') {
            error.value =
              isRecord(evt.data) && typeof evt.data.message === 'string'
                ? evt.data.message
                : 'Generation failed';
            break;
          } else if (evt.event === 'done') {
            break;
          }
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        error.value = err instanceof Error ? err.message : 'Generation failed';
      }
    }

    isRunning.value = false;
    controller = null;
  }

  return { variables, isRunning, error, output, fetchVariables, run, stop };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
