import { ref, type Ref } from 'vue';
import type { AiGenerateRequest } from '@forge/shared';
import { parseSseStream } from '@/lib/ai/sse-stream';
import { useAuthStore } from '@/stores/auth';

export type UseAiGenerateReturn = {
  isGenerating: Ref<boolean>;
  error: Ref<string | null>;
  start: (req: AiGenerateRequest, onToken: (text: string) => void) => Promise<void>;
  stop: () => void;
};

type E2EWindow = Window & {
  __E2E__?: boolean;
  __forgeE2eAiAbort?: () => void;
};

export function useAiGenerate(): UseAiGenerateReturn {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;

  function stop(): void {
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  async function start(req: AiGenerateRequest, onToken: (text: string) => void): Promise<void> {
    // Abort any in-flight request first (idempotent re-call)
    stop();

    controller = new AbortController();
    isGenerating.value = true;
    error.value = null;

    const win = window as E2EWindow;
    const e2eHookEnabled = import.meta.env.MODE !== 'production' && win.__E2E__ === true;
    if (e2eHookEnabled) {
      win.__forgeE2eAiAbort = () => controller?.abort();
    }

    try {
      // /api/ai/generate is auth-gated (`app.aiGate` in packages/server).
      // We can't use `apiFetch` here because it buffers the body via .json(),
      // but we still need the bearer token attached so the server doesn't 401.
      const authStore = useAuthStore();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authStore.accessToken) {
        headers.Authorization = `Bearer ${authStore.accessToken}`;
      }
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!res.ok || !res.body) {
        error.value = 'Request failed';
      } else {
        for await (const evt of parseSseStream(res.body)) {
          if (evt.event === 'token' && isRecord(evt.data) && typeof evt.data.text === 'string') {
            onToken(evt.data.text);
          } else if (evt.event === 'error') {
            const msg =
              isRecord(evt.data) && typeof evt.data.message === 'string'
                ? evt.data.message
                : 'Generation failed';
            error.value = msg;
            break;
          } else if (evt.event === 'done') {
            break;
          }
        }
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (!isAbort) {
        error.value = err instanceof Error ? err.message : 'Generation failed';
      }
    } finally {
      if (e2eHookEnabled) {
        delete win.__forgeE2eAiAbort;
      }
      isGenerating.value = false;
      controller = null;
    }
  }

  return { isGenerating, error, start, stop };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
