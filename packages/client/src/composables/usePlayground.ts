import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { ContentType, PromptVariable } from '@forge/shared';
import { extractRequiredVariables } from '@forge/shared';
import { apiFetch } from '@/lib/api';
import { parseSseStream } from '@/lib/ai/sse-stream';

export type PlaygroundPost = {
  id: string;
  title: string;
  contentType: ContentType;
  content: string;
};

export type UsePlaygroundReturn = {
  variables: Ref<PromptVariable[]>;
  isRunning: Ref<boolean>;
  error: Ref<string | null>;
  output: Ref<string>;
  currentPost: Ref<PlaygroundPost | null>;
  loadError: Ref<string | null>;
  missingVariables: Ref<string[]>;
  inputValues: Ref<Record<string, string>>;
  requiredVariables: ComputedRef<string[]>;
  canRun: ComputedRef<boolean>;
  fetchVariables: (postId: string) => Promise<void>;
  fetchPost: (postId: string) => Promise<void>;
  run: (postId: string, vars: Record<string, string>) => Promise<void>;
  stop: () => void;
};

export function usePlayground(): UsePlaygroundReturn {
  const variables = ref<PromptVariable[]>([]);
  const isRunning = ref(false);
  const error = ref<string | null>(null);
  const output = ref('');
  const currentPost = ref<PlaygroundPost | null>(null);
  const loadError = ref<string | null>(null);
  const missingVariables = ref<string[]>([]);
  const inputValues = ref<Record<string, string>>({});
  let controller: AbortController | null = null;

  const requiredVariables = computed<string[]>(() => {
    const post = currentPost.value;
    if (!post) return [];
    return extractRequiredVariables(post.content, variables.value);
  });

  const canRun = computed<boolean>(() =>
    requiredVariables.value.every((name) => (inputValues.value[name] ?? '').trim() !== ''),
  );

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

  async function fetchPost(postId: string): Promise<void> {
    loadError.value = null;
    try {
      const res = await apiFetch(`/api/posts/${postId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        loadError.value = body.error ?? 'Failed to load post';
        currentPost.value = null;
        return;
      }
      const data = (await res.json()) as {
        post: {
          id: string;
          title: string;
          contentType: ContentType;
          revisions?: Array<{ content: string }> | null;
        };
      };
      currentPost.value = {
        id: data.post.id,
        title: data.post.title,
        contentType: data.post.contentType,
        content: data.post.revisions?.[0]?.content ?? '',
      };
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load post';
      currentPost.value = null;
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

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          missing?: string[];
        };
        if (res.status === 400 && body.code === 'MISSING_REQUIRED_VARIABLES') {
          error.value = body.error ?? 'Request failed';
          missingVariables.value = body.missing ?? [];
        } else if (res.status === 400) {
          error.value = body.error ?? 'Request failed';
          missingVariables.value = [];
        } else {
          error.value = 'Request failed';
          missingVariables.value = [];
        }
      } else if (!res.body) {
        error.value = 'Request failed';
        missingVariables.value = [];
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
        if (error.value === null) {
          missingVariables.value = [];
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        error.value = err instanceof Error ? err.message : 'Generation failed';
        missingVariables.value = [];
      }
    }

    isRunning.value = false;
    controller = null;
  }

  return {
    variables,
    isRunning,
    error,
    output,
    currentPost,
    loadError,
    missingVariables,
    inputValues,
    requiredVariables,
    canRun,
    fetchVariables,
    fetchPost,
    run,
    stop,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
