<script setup lang="ts">
/* global HTMLInputElement */
import { ref, computed, watch } from 'vue';
import type { ContentType, Visibility, AiCompleteRequest, AiGenerateRequest } from '@forge/shared';
import type { EditorView } from '@codemirror/view';
import type { SaveStatus } from '@/stores/posts';
import CodeEditor from '@/components/editor/CodeEditor.vue';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';
import DraftStatus from '@/components/editor/DraftStatus.vue';
import AiSuggestion from '@/components/editor/AiSuggestion.vue';
import AiGeneratePanel from '@/components/editor/AiGeneratePanel.vue';
import FileSidebar from '@/components/post/FileSidebar.vue';
import FileUpload from '@/components/post/FileUpload.vue';
import { useFilesStore } from '@/stores/files';

/** Narrow content-type enum accepted by AiGeneratePanel (excludes 'link'). */
type AiGenerateContentType = AiGenerateRequest['contentType'];

const props = defineProps<{
  modelValue: string;
  title: string;
  language: string;
  visibility: Visibility;
  contentType: ContentType;
  tags: string[];
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  postId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:title': [value: string];
  'update:language': [value: string];
  'update:visibility': [value: Visibility];
  'update:contentType': [value: ContentType];
  'update:tags': [value: string[]];
  publish: [];
  'save-draft': [];
}>();

const filesStore = useFilesStore();
const isDragging = ref(false);
// Local list of files attached pre-creation (no postId yet). Mirrors the
// staged-files concept but lives in the component so the new-post page can
// preview attachments before the post exists.
const localStagedFiles = ref<{ name: string; size: number }[]>([]);
const showFileSidebar = computed(() => filesStore.stagedFiles.length > 0);

function handleDrop(e: DragEvent): void {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0 || !props.postId) return;
  for (const file of Array.from(files)) {
    void filesStore.uploadFile(props.postId, file);
  }
}

async function handleFileUpload(file: File): Promise<void> {
  if (!props.postId) return;
  await filesStore.uploadFile(props.postId, file);
}

function handleLocalFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    if (props.postId) {
      void filesStore.uploadFile(props.postId, file);
    } else {
      localStagedFiles.value.push({ name: file.name, size: file.size });
    }
  }
}

const editorRef = ref<{ view: EditorView | null } | null>(null);
const editorView = computed(() => editorRef.value?.view ?? null);
const aiRef = ref<{ requestCompletion: (input: AiCompleteRequest) => void } | null>(null);

watch([() => props.modelValue, () => props.language, editorView], () => {
  const view = editorView.value;
  if (!view || !aiRef.value) return;
  const doc = view.state.doc.toString();
  const cursor = view.state.selection.main.head;
  aiRef.value.requestCompletion({
    before: doc.slice(0, cursor),
    after: doc.slice(cursor),
    language: props.language,
  });
});

/* global Event, DragEvent, File */
function onTitleInput(event: Event): void {
  const target = event.target as unknown as { value: string };
  emit('update:title', target.value);
}

// AI generation is only meaningful for snippet | prompt | document — not 'link' (a URL is not generatable content).
const AI_GENERATE_CONTENT_TYPES: ReadonlySet<string> = new Set<AiGenerateContentType>([
  'snippet',
  'prompt',
  'document',
]);
const isAiGenerateContentType = computed(() => AI_GENERATE_CONTENT_TYPES.has(props.contentType));
</script>

<template>
  <div class="flex h-full flex-col rounded-lg border border-surface-500 bg-surface">
    <div class="flex items-center gap-3 border-b border-surface-500 px-4 py-3">
      <input
        data-testid="new-post-title-input"
        :value="title"
        type="text"
        placeholder="Snippet title..."
        class="flex-1 bg-transparent text-lg text-gray-100 placeholder-gray-500 outline-none"
        @input="onTitleInput"
      />
      <DraftStatus :status="saveStatus" :last-saved-at="lastSavedAt" />
      <button
        data-testid="new-post-save-draft-btn"
        class="rounded border border-surface-500 px-4 py-1.5 text-sm font-medium text-gray-200 hover:bg-surface-600"
        @click="emit('save-draft')"
      >
        Save Draft
      </button>
      <button
        data-testid="new-post-publish-btn"
        class="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
        @click="emit('publish')"
      >
        Publish Snippet
      </button>
    </div>

    <div class="border-b border-surface-500 px-4 py-2">
      <EditorToolbar
        :language="language"
        :visibility="visibility"
        :content-type="contentType"
        :tags="tags"
        @update:language="(val) => emit('update:language', val)"
        @update:visibility="(val) => emit('update:visibility', val)"
        @update:content-type="(val) => emit('update:contentType', val)"
        @update:tags="(val) => emit('update:tags', val)"
      />
      <!--
        Always-available file attach input. Hidden in the layout (label is the
        accessible affordance) but visible-to-Playwright via getByTestId. When
        no postId exists yet (new-post page), uploads are staged locally and
        rendered as preview tiles. Once the post is created, real uploads flow
        through filesStore.
      -->
      <input
        data-testid="file-upload-input"
        type="file"
        class="sr-only"
        @change="handleLocalFileChange"
      />
      <div v-if="localStagedFiles.length > 0" class="mt-2 flex flex-wrap gap-2">
        <div
          v-for="(file, idx) in localStagedFiles"
          :key="`${file.name}-${idx}`"
          data-testid="file-upload-preview"
          class="rounded border border-surface-500 bg-surface-700 px-2 py-1 text-xs text-gray-300"
        >
          {{ file.name }}
        </div>
      </div>
    </div>

    <div
      data-testid="editor-drop-zone"
      class="flex flex-1 overflow-hidden"
      :class="{ 'ring-2 ring-purple-500 ring-inset': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.self="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <FileSidebar
        v-if="showFileSidebar"
        :files="filesStore.stagedFiles"
        :active-file-id="filesStore.activeFileId"
        :editable="true"
        @select="filesStore.setActiveFile"
      >
        <template #upload>
          <FileUpload @upload="handleFileUpload" />
        </template>
      </FileSidebar>
      <div data-testid="new-post-body-editor" class="flex-1 relative">
        <CodeEditor
          ref="editorRef"
          :model-value="modelValue"
          :language="language"
          @update:model-value="(val) => emit('update:modelValue', val)"
        />
        <AiSuggestion v-if="editorView" ref="aiRef" :editor-view="editorView as EditorView" />
        <AiGeneratePanel
          v-if="editorView && isAiGenerateContentType"
          :editor-view="editorView as EditorView"
          :content-type="contentType as AiGenerateContentType"
          :language="language"
          class="absolute bottom-4 right-4"
        />
      </div>
    </div>
  </div>
</template>
