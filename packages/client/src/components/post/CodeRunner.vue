<template>
  <div
    v-if="supported || showDisabled"
    data-testid="code-runner"
  >
    <div class="flex items-center justify-end py-1">
      <RunButton
        v-if="supported"
        :status="status"
        @run="handleRun"
        @abort="abort"
      />
      <RunButton
        v-else
        status="idle"
        :disabled="true"
        :disabled-reason="`Run not available for ${language}`"
      />
    </div>
    <ExecutionOutput
      v-if="supported"
      :output="output"
      :status="status"
      :execution-time="executionTime"
      :exit-code="exitCode"
      :truncated="truncated"
      @clear="clear"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PostFile } from '@forge/shared';
import { useCodeRunner } from '../../composables/useCodeRunner.js';
import { isSandboxLanguage, languageToExtension } from '../../lib/sandbox/languages.js';
import type { SandboxLanguage } from '../../lib/sandbox/languages.js';
import { apiFetch } from '../../lib/api.js';
import RunButton from './RunButton.vue';
import ExecutionOutput from './ExecutionOutput.vue';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  postId: string;
  revisionId: string;
  language: string | null;
  singleFileContent?: string;
  files?: PostFile[];
  activeFilename?: string;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECOGNIZED_LANGUAGES = [
  'python', 'javascript', 'typescript', 'go', 'rust', 'java', 'c', 'cpp',
  'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'haskell', 'lua',
  'perl', 'r', 'dart', 'elixir', 'clojure', 'zig', 'nim',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

const { output, status, executionTime, exitCode, truncated, run, abort, clear } =
  useCodeRunner();

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const supported = computed(() => isSandboxLanguage(props.language));

const showDisabled = computed(() => {
  if (props.language === null) return false;
  return (
    !supported.value &&
    (RECOGNIZED_LANGUAGES as readonly string[]).includes(props.language)
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTextMimeType(mimeType: string | null): boolean {
  if (mimeType === null) return true;
  if (mimeType.startsWith('text/')) return true;
  if (mimeType === 'application/json') return true;
  if (mimeType === 'application/javascript') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Run handler
// ---------------------------------------------------------------------------

async function handleRun(): Promise<void> {
  const lang = props.language as SandboxLanguage;

  // Multi-file mode: files array takes precedence
  if (props.files && props.files.length > 0) {
    const textFiles = props.files.filter((f) => isTextMimeType(f.mimeType));

    try {
      const fetched = await Promise.all(
        textFiles.map(async (file) => {
          const response = await apiFetch(`/api/posts/${props.postId}/files/${file.id}`);
          const content = await response.text();
          return { filename: file.filename, content };
        }),
      );

      const entryFile = props.activeFilename ?? textFiles[0]?.filename ?? 'main.js';
      run({ language: lang, files: fetched, entryFile });
    } catch {
      output.value = [
        {
          stream: 'stderr',
          text: 'Failed to fetch file contents',
          timestamp: Date.now(),
        },
      ];
      status.value = 'error';
    }

    return;
  }

  // Single-file mode
  const ext = languageToExtension(lang);
  const filename = `main${ext}`;
  const content = props.singleFileContent ?? '';
  run({ language: lang, files: [{ filename, content }], entryFile: filename });
}
</script>
