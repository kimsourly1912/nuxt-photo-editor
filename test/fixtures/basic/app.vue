<script setup lang="ts">
import { ref } from 'vue'

const photo = ref<{ id: string, url: string } | null>(null)
const upload = async (_file: File, _signal: AbortSignal) => ({ id: 'test', url: '/photo.jpg' })
</script>

<template>
  <UApp>
    <PhotoUploadEditor
      v-model="photo"
      :upload="upload"
      label="Menu photo"
    />
  </UApp>
</template>
