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
  catch (cause) {
    console.error('[PhotoUploadEditor] Failed to mount Editx', cause)
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
  <div>
    <div class="mb-2 flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span class="font-semibold">{{ label }}</span>
      <span class="text-sm text-muted">JPEG, PNG or WebP · up to {{ Math.round(maxInputBytes / 1024 / 1024) }} MB</span>
    </div>

    <div
      v-if="modelValue"
      class="grid gap-3"
    >
      <img
        :src="modelValue.url"
        :alt="label"
        class="block max-h-56 w-full max-w-72 rounded-xl object-cover"
      >
      <div class="flex flex-wrap items-center gap-2">
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
      class="mt-2 text-error"
      role="alert"
    >
      {{ flow.error.value }}
    </p>

    <UModal
      v-model:open="open"
      :dismissible="false"
      :ui="{ content: 'h-dvh w-screen max-w-none rounded-none sm:h-auto sm:w-[96vw] sm:max-w-[1100px] sm:rounded-lg' }"
    >
      <template #content>
        <div class="max-h-dvh min-h-96 overflow-auto bg-default sm:max-h-[92dvh]">
          <div
            v-show="flow.stage.value === 'edit'"
            ref="editorElement"
            class="h-dvh min-h-0 sm:h-[min(78dvh,760px)] sm:min-h-96"
          />
          <div
            v-if="flow.error.value && flow.stage.value === 'edit'"
            class="flex items-center justify-between gap-4 px-4 py-2"
          >
            <p
              class="mt-2 text-error"
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
            class="grid min-h-dvh grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 p-5 sm:min-h-0 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)] sm:grid-rows-none"
          >
            <div class="col-span-full flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold">
                  Review photo
                </h2><p class="text-muted">
                  Check the final crop before uploading.
                </p>
              </div>
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
              class="max-h-[min(52dvh,28rem)] w-full rounded-lg bg-elevated object-contain"
            >
            <p
              v-if="flow.prepared.value"
              class="text-sm text-muted"
            >
              {{ flow.prepared.value.width }} × {{ flow.prepared.value.height }} ·
              {{ flow.prepared.value.file.type.replace('image/', '').toUpperCase() }} ·
              {{ (flow.prepared.value.file.size / 1024).toFixed(0) }} KB
              (original {{ (flow.prepared.value.originalBytes / 1024).toFixed(0) }} KB, {{ sizeChange }})
            </p>
            <p
              v-if="flow.error.value"
              class="col-span-full mt-2 text-error"
              role="alert"
            >
              {{ flow.error.value }}
            </p>
            <div class="sticky bottom-0 col-span-full flex flex-wrap items-center justify-end gap-2 bg-default py-3 sm:static sm:py-0">
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
