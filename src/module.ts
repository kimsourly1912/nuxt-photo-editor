import { addComponent, addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export type { PreparedPhoto, PhotoStage, PhotoUpload, UploadedPhoto } from './runtime/composables/usePhotoUploadEditor'

export type ModuleOptions = Record<string, never>

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@kimsourly1912/nuxt-photo-editor',
    configKey: 'photoEditor',
  },
  defaults: {},
  setup(_options) {
    const resolver = createResolver(import.meta.url)
    addComponent({ name: 'PhotoUploadEditor', filePath: resolver.resolve('./runtime/components/PhotoUploadEditor.vue') })
    addImports({ name: 'usePhotoUploadEditor', from: resolver.resolve('./runtime/composables/usePhotoUploadEditor') })
  },
})
