<script setup lang="ts">
import type { EditorHandle, ImageEditorConfig } from '@editx/image-editor'
import type { ImageEditorInstance } from '@editx/image-editor/vanilla'
import { computed, onBeforeUnmount, ref, shallowRef, nextTick, watch } from 'vue'
import type { PhotoUpload, UploadedPhoto } from '../composables/usePhotoUploadEditor'
import { usePhotoUploadEditor } from '../composables/usePhotoUploadEditor'

interface Props {
  label?: string
  modelValue?: UploadedPhoto | null
  upload: PhotoUpload
  maxInputBytes?: number
  cropRatios?: Array<{ id: string, label: string, ratio: number | 'free' | 'original' }>
  outputFormat?: 'webp' | 'jpeg' | 'png'
  outputQuality?: number
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Photo',
  modelValue: null,
  maxInputBytes: 10 * 1024 * 1024,
  outputFormat: 'webp',
  outputQuality: 0.82,
  cropRatios: () => [
    { id: 'free', label: 'Free', ratio: 'free' },
    { id: 'square', label: '1:1', ratio: 1 },
    { id: 'landscape', label: '4:3', ratio: 4 / 3 },
  ],
})

const emit = defineEmits<{
  'update:modelValue': [value: UploadedPhoto | null]
  'uploaded': [value: UploadedPhoto]
  'removed': [value: UploadedPhoto]
}>()

const flow = usePhotoUploadEditor()
const chosen = shallowRef<File | null>(null)
const open = ref(false)
const editorElement = ref<HTMLElement | null>(null)
const removedPhoto = shallowRef<UploadedPhoto | null>(null)
const loadingExisting = ref(false)
const confirmDiscard = ref(false)
const replacement = shallowRef<File | null>(null)
const sizeChange = computed(() => {
  if (!flow.prepared.value) return ''
  const change = Math.round((1 - flow.prepared.value.file.size / flow.prepared.value.originalBytes) * 100)
  return change >= 0 ? `${change}% smaller` : `${Math.abs(change)}% larger`
})
let editor: ImageEditorInstance | null = null
let editorHandle: EditorHandle | null = null
let scene: string | null = null

function destroyEditor() {
  editor?.destroy()
  editor = null
  editorHandle = null
}

async function mountEditor() {
  if (!import.meta.client || !open.value || flow.stage.value !== 'edit' || !flow.source.value) return
  await nextTick()
  if (!editorElement.value) return
  destroyEditor()
  try {
    const { createImageEditor } = await import('@editx/image-editor/vanilla')
    if (!open.value || flow.stage.value !== 'edit' || !editorElement.value || !flow.source.value) return
    const config: ImageEditorConfig = {
      tools: ['crop', 'adjust'],
      defaultTool: 'crop',
      crop: { aspectRatios: props.cropRatios, showRotateFlip: true },
      export: { formats: [props.outputFormat], defaultFormat: props.outputFormat, quality: props.outputQuality },
      ui: { title: props.label, unsavedChangesWarning: true },
    }
    editor = createImageEditor(editorElement.value, {
      src: flow.source.value,
      height: '100%',
      config,
      onReady: (handle) => {
        editorHandle = handle
        if (scene) void handle.loadScene(scene).catch(() => {
          flow.error.value = 'The previous edits could not be restored.'
        })
      },
      onSave: (blob) => {
        scene = editorHandle?.saveScene() ?? null
        void flow.review(blob).then((ready) => {
          if (ready) destroyEditor()
        })
      },
      onClose: () => closeEditor(),
    })
  }
  catch {
    flow.error.value = 'The editor could not be loaded. Please try again.'
  }
}

function closeEditor(force = false) {
  if (flow.stage.value === 'uploading') return
  if (!force && flow.stage.value === 'review') {
    replacement.value = null
    confirmDiscard.value = true
    return
  }
  open.value = false
  destroyEditor()
  flow.reset()
  scene = null
  chosen.value = null
}

function selectPhoto(file: File) {
  if (flow.select(file, props.maxInputBytes)) {
    destroyEditor()
    scene = null
    open.value = true
    void mountEditor()
  }
  else chosen.value = null
}

watch(chosen, (file) => {
  if (!file) return
  if (open.value) {
    replacement.value = file
    confirmDiscard.value = true
    return
  }
  selectPhoto(file)
})

function discard() {
  confirmDiscard.value = false
  if (replacement.value) {
    const file = replacement.value
    replacement.value = null
    selectPhoto(file)
  }
  else closeEditor(true)
}

async function editExisting() {
  if (!props.modelValue?.url) return
  loadingExisting.value = true
  flow.error.value = null
  try {
    const response = await fetch(props.modelValue.url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Image unavailable')
    const blob = await response.blob()
    const file = new File([blob], 'photo', { type: blob.type })
    chosen.value = file
  }
  catch {
    flow.error.value = 'This photo cannot be edited here. Choose a replacement photo instead.'
  }
  finally {
    loadingExisting.value = false
  }
}

function editAgain() {
  flow.stage.value = 'edit'
  void mountEditor()
}

async function usePhoto() {
  const result = await flow.upload(props.upload)
  if (!result) return
  emit('update:modelValue', result)
  emit('uploaded', result)
  removedPhoto.value = null
  closeEditor(true)
}

function removePhoto() {
  if (!props.modelValue) return
  removedPhoto.value = props.modelValue
  emit('update:modelValue', null)
  emit('removed', removedPhoto.value)
}

function undoRemove() {
  if (!removedPhoto.value) return
  emit('update:modelValue', removedPhoto.value)
  removedPhoto.value = null
}

onBeforeUnmount(() => {
  destroyEditor()
  flow.reset()
})
</script>

<template>
  <div class="photo-upload-editor">
    <div class="photo-upload-editor__heading">
      <span class="photo-upload-editor__label">{{ label }}</span>
      <span class="photo-upload-editor__hint">JPEG, PNG or WebP · up to {{ Math.round(maxInputBytes / 1024 / 1024) }} MB</span>
    </div>

    <div
      v-if="modelValue"
      class="photo-upload-editor__current"
    >
      <img
        :src="modelValue.url"
        :alt="label"
        class="photo-upload-editor__image"
      >
      <div class="photo-upload-editor__actions">
        <UButton
          label="Edit"
          variant="soft"
          :loading="loadingExisting"
          @click="editExisting"
        />
        <UFileUpload
          v-model="chosen"
          variant="button"
          label="Replace"
          accept="image/jpeg,image/png,image/webp"
          :multiple="false"
        />
        <UButton
          label="Remove"
          variant="ghost"
          color="error"
          @click="removePhoto"
        />
      </div>
    </div>
    <UFileUpload
      v-else
      v-model="chosen"
      accept="image/jpeg,image/png,image/webp"
      :multiple="false"
      label="Choose photo"
      description="Drop a photo here or choose a file"
    />
    <UButton
      v-if="removedPhoto && !modelValue"
      label="Undo remove"
      variant="link"
      @click="undoRemove"
    />
    <p
      v-if="flow.error.value && !open"
      class="photo-upload-editor__error"
      role="alert"
    >
      {{ flow.error.value }}
    </p>

    <UModal
      v-model:open="open"
      :dismissible="false"
      :ui="{ content: 'photo-upload-editor__modal' }"
    >
      <template #content>
        <div class="photo-upload-editor__dialog">
          <div
            v-show="flow.stage.value === 'edit'"
            ref="editorElement"
            class="photo-upload-editor__editor"
          />
          <div
            v-if="flow.error.value && flow.stage.value === 'edit'"
            class="photo-upload-editor__edit-error"
          >
            <p
              class="photo-upload-editor__error"
              role="alert"
            >
              {{ flow.error.value }}
            </p>
            <UButton
              label="Cancel"
              variant="outline"
              @click="closeEditor(true)"
            />
          </div>
          <div
            v-if="flow.stage.value === 'review' || flow.stage.value === 'uploading'"
            class="photo-upload-editor__review"
          >
            <div class="photo-upload-editor__review-head">
              <div><h2>Review photo</h2><p>Check the final crop before uploading.</p></div>
              <UButton
                label="Close"
                variant="ghost"
                :disabled="flow.stage.value === 'uploading'"
                @click="closeEditor()"
              />
            </div>
            <img
              v-if="flow.previewUrl.value"
              :src="flow.previewUrl.value"
              alt="Edited photo preview"
              class="photo-upload-editor__preview"
            >
            <p
              v-if="flow.prepared.value"
              class="photo-upload-editor__facts"
            >
              {{ flow.prepared.value.width }} × {{ flow.prepared.value.height }} ·
              {{ flow.prepared.value.file.type.replace('image/', '').toUpperCase() }} ·
              {{ (flow.prepared.value.file.size / 1024).toFixed(0) }} KB
              (original {{ (flow.prepared.value.originalBytes / 1024).toFixed(0) }} KB, {{ sizeChange }})
            </p>
            <p
              v-if="flow.error.value"
              class="photo-upload-editor__error"
              role="alert"
            >
              {{ flow.error.value }}
            </p>
            <div class="photo-upload-editor__review-actions">
              <UButton
                label="Edit again"
                variant="outline"
                :disabled="flow.stage.value === 'uploading'"
                @click="editAgain"
              />
              <UFileUpload
                v-model="chosen"
                variant="button"
                label="Choose different photo"
                accept="image/jpeg,image/png,image/webp"
                :multiple="false"
                :disabled="flow.stage.value === 'uploading'"
              />
              <UButton
                :label="flow.error.value ? 'Retry upload' : 'Use photo'"
                :loading="flow.stage.value === 'uploading'"
                @click="usePhoto"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>
    <UModal
      v-model:open="confirmDiscard"
      title="Discard edited photo?"
      description="Your current edits will be lost."
    >
      <template #footer>
        <UButton
          label="Keep editing"
          variant="outline"
          @click="confirmDiscard = false; replacement = null; chosen = null"
        />
        <UButton
          label="Discard edits"
          color="error"
          @click="discard"
        />
      </template>
    </UModal>
  </div>
</template>

<style>
.photo-upload-editor__heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem 1rem; margin-bottom: .65rem; }
.photo-upload-editor__label { font-weight: 600; }
.photo-upload-editor__hint, .photo-upload-editor__facts { color: var(--ui-text-muted); font-size: .875rem; }
.photo-upload-editor__current { display: grid; gap: .75rem; }
.photo-upload-editor__image { display: block; width: min(100%, 18rem); max-height: 14rem; object-fit: cover; border-radius: .75rem; }
.photo-upload-editor__actions, .photo-upload-editor__review-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.photo-upload-editor__error { color: var(--ui-error); margin-top: .5rem; }
.photo-upload-editor__edit-error { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .5rem 1rem; }
.photo-upload-editor__modal { width: min(96vw, 1100px) !important; max-width: none !important; }
.photo-upload-editor__dialog { min-height: 24rem; max-height: 92dvh; overflow: auto; background: var(--ui-bg); }
.photo-upload-editor__editor { height: min(78dvh, 760px); min-height: 25rem; }
.photo-upload-editor__review { padding: 1.25rem; display: grid; grid-template-columns: minmax(0, 2fr) minmax(12rem, 1fr); align-items: center; gap: 1rem; }
.photo-upload-editor__review-head, .photo-upload-editor__review-actions, .photo-upload-editor__review > .photo-upload-editor__error { grid-column: 1 / -1; }
.photo-upload-editor__review-head { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
.photo-upload-editor__review-head h2 { font-weight: 600; font-size: 1.125rem; }
.photo-upload-editor__review-head p { color: var(--ui-text-muted); }
.photo-upload-editor__preview { max-height: min(52dvh, 28rem); width: 100%; object-fit: contain; background: var(--ui-bg-muted); border-radius: .5rem; }
.photo-upload-editor__review-actions { justify-content: flex-end; }
@media (max-width: 640px) {
  .photo-upload-editor__modal { width: 100vw !important; height: 100dvh !important; border-radius: 0 !important; }
  .photo-upload-editor__dialog { height: 100dvh; max-height: 100dvh; }
  .photo-upload-editor__editor { height: 100dvh; min-height: 0; }
  .photo-upload-editor__review { min-height: 100dvh; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto auto; }
  .photo-upload-editor__review-actions { position: sticky; bottom: 0; background: var(--ui-bg); padding: .75rem 0; }
}
</style>
