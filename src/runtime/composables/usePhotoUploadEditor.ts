import { useObjectUrl } from '@vueuse/core'
import { computed, shallowRef } from 'vue'

export interface PreparedPhoto {
  file: File
  width: number
  height: number
  originalBytes: number
}

export interface UploadedPhoto {
  id: string
  url: string
  [key: string]: unknown
}

export type PhotoUpload = (file: File, signal: AbortSignal) => Promise<UploadedPhoto>
export type PhotoStage = 'select' | 'edit' | 'review' | 'uploading'

export function usePhotoUploadEditor() {
  const source = shallowRef<File | null>(null)
  const prepared = shallowRef<PreparedPhoto | null>(null)
  const stage = shallowRef<PhotoStage>('select')
  const error = shallowRef<string | null>(null)
  const controller = shallowRef<AbortController | null>(null)
  const previewUrl = useObjectUrl(computed(() => prepared.value?.file ?? null))

  function select(file: File, maxInputBytes = 10 * 1024 * 1024) {
    error.value = null
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      error.value = 'Choose a JPEG, PNG, or WebP image.'
      return false
    }
    if (file.size > maxInputBytes) {
      error.value = `Choose an image smaller than ${Math.round(maxInputBytes / 1024 / 1024)} MB.`
      return false
    }
    source.value = file
    prepared.value = null
    stage.value = 'edit'
    return true
  }

  async function review(blob: Blob) {
    if (!source.value || !blob.size || !blob.type.startsWith('image/')) {
      error.value = 'The edited image could not be exported. Try again.'
      return false
    }
    try {
      const bitmap = await createImageBitmap(blob)
      const { width, height } = bitmap
      bitmap.close()
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp'
      const basename = source.value.name.replace(/\.[^.]+$/, '')
      prepared.value = {
        file: new File([blob], `${basename}-edited.${extension}`, { type: blob.type }),
        width,
        height,
        originalBytes: source.value.size,
      }
      error.value = null
      stage.value = 'review'
      return true
    }
    catch {
      error.value = 'The edited image could not be opened. Try exporting it again.'
      return false
    }
  }

  async function upload(handler: PhotoUpload) {
    if (!prepared.value || stage.value === 'uploading') return null
    const activeController = new AbortController()
    controller.value = activeController
    stage.value = 'uploading'
    error.value = null
    try {
      const result = await handler(prepared.value.file, activeController.signal)
      if (activeController.signal.aborted) return null
      return result
    }
    catch {
      if (!activeController.signal.aborted) error.value = 'Upload failed. Your edited photo is still here. Try again.'
      return null
    }
    finally {
      if (controller.value === activeController) {
        controller.value = null
        stage.value = 'review'
      }
    }
  }

  function reset() {
    controller.value?.abort()
    controller.value = null
    source.value = null
    prepared.value = null
    error.value = null
    stage.value = 'select'
  }

  return { source, prepared, stage, error, previewUrl, select, review, upload, reset }
}
