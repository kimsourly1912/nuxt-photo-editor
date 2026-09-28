# Nuxt Photo Editor

A reusable single-photo upload field for Nuxt 4. It pairs [Nuxt UI](https://ui.nuxt.com/) and [VueUse](https://vueuse.org/) with the [Editx image editor](https://github.com/amrelbialy/editx). Users choose a JPEG, PNG, or WebP photo, crop/rotate/flip/zoom/adjust it, review the exported file, and upload only when they press **Use photo**.

> Early package preview. The Editx dependency is pinned to `0.1.0-alpha.6`; review its behavior and bundle size before production use.

## Install

```sh
npm install @kimsourly1912/nuxt-photo-editor @nuxt/ui
```

Add the module alongside Nuxt UI:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@kimsourly1912/nuxt-photo-editor'],
  css: ['~/assets/css/main.css'],
})
```

Editx renders utility classes at runtime. In your Tailwind v4 stylesheet, import its theme and scan its installed package. Adjust the relative `@source` path to your stylesheet's location:

```css
/* app/assets/css/main.css (three levels up to the app root) */
@import "tailwindcss";
@import "@nuxt/ui";
@import "@editx/image-editor/styles.css";
@source "../../../node_modules/@editx/image-editor/dist";
```

For monorepos or nonstandard `node_modules` layouts, point `@source` at the installed Editx `dist` folder. The editor may render without its controls styled if Tailwind does not scan that folder.

## Use in a form

```vue
<script setup lang="ts">
import type { UploadedPhoto } from '@kimsourly1912/nuxt-photo-editor'

const photo = ref<UploadedPhoto | null>(null)

async function uploadPhoto(file: File, signal: AbortSignal): Promise<UploadedPhoto> {
  const body = new FormData()
  body.append('file', file)
  return await $fetch<UploadedPhoto>('/api/photos', {
    method: 'POST',
    body,
    signal,
  })
}

async function saveForm() {
  await $fetch('/api/menu-items', { method: 'POST', body: { photoId: photo.value?.id } })
}
</script>

<template>
  <UApp>
    <PhotoUploadEditor v-model="photo" label="Menu photo" :upload="uploadPhoto" />
    <UButton label="Save menu item" @click="saveForm" />
  </UApp>
</template>
```

The editor uploads the processed file on **Use photo** and updates `v-model` only after the upload succeeds. Saving the surrounding form is the host application's responsibility. Removing a photo updates `v-model` and emits `removed`; defer deleting stored images until the form save succeeds if you need Undo or save retry behavior.

### Props and events

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `v-model` | `{ id: string; url: string } \| null` | `null` | Current uploaded image reference. |
| `upload` | `(file: File, signal: AbortSignal) => Promise<UploadedPhoto>` | required | Application-owned upload. Honor the abort signal if possible. |
| `label` | `string` | `Photo` | Accessible field and editor label. |
| `max-input-bytes` | `number` | `10485760` | Input size limit; JPEG, PNG, WebP only. |
| `crop-ratios` | `{ id; label; ratio }[]` | Free, 1:1, 4:3 | Crop presets; ratio is a number, `free`, or `original`. |
| `output-format` | `webp \| jpeg \| png` | `webp` | Export MIME format. |
| `output-quality` | `number` | `0.82` | Lossy export quality, typically 0–1. |

`uploaded` emits the returned image. `removed` emits the prior image reference when Remove is clicked. `update:modelValue` also fires for upload, removal, and Undo. The component does not call a delete endpoint.

### Composable

`usePhotoUploadEditor()` is auto-imported by the module. It exposes `source`, `prepared`, `previewUrl`, `stage`, `error`, `select(file, maxBytes)`, `review(blob)`, `upload(handler)`, and `reset()`. `review` stores the actual exported file and dimensions; `upload` is explicit and retains the reviewed file for retry after a failure. Import the associated TypeScript types from the package root.

## Development

```sh
npm install
npm run dev          # playground
npm run lint
npm run test:types
npm test
npm run prepack      # build distributable
```

The playground uses an in-memory object URL as a mock upload. It does not persist photos.

Built from the [official Nuxt module starter](https://github.com/nuxt/starter/tree/module) and [Nuxt module authoring guide](https://nuxt.com/docs/4.x/guide/going-further/modules).

MIT
