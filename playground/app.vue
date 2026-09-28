<script setup lang="ts">
import type { UploadedPhoto } from '@kimsourly1912/nuxt-photo-editor'

const photo = ref<UploadedPhoto | null>(null)
const localUrl = shallowRef<string | null>(null)

async function upload(file: File, signal: AbortSignal): Promise<UploadedPhoto> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 600)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Cancelled'))
    }, { once: true })
  })
  if (localUrl.value) URL.revokeObjectURL(localUrl.value)
  localUrl.value = URL.createObjectURL(file)
  return { id: crypto.randomUUID(), url: localUrl.value }
}

onBeforeUnmount(() => {
  if (localUrl.value) URL.revokeObjectURL(localUrl.value)
})
</script>

<template>
  <UApp>
    <main class="mx-auto max-w-3xl px-5 py-14">
      <h1 class="mb-2 text-3xl font-semibold">
        Nuxt Photo Editor
      </h1>
      <p class="mb-8 text-muted">
        Choose a photo, edit it, review the output, then upload it.
      </p>
      <PhotoUploadEditor
        v-model="photo"
        :upload="upload"
        label="Profile photo"
      />
      <pre
        v-if="photo"
        class="mt-8 overflow-auto rounded-lg bg-elevated p-4 text-sm"
      >{{ photo }}</pre>
    </main>
  </UApp>
</template>
