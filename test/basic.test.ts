import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('ssr', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('renders the registered upload field on the server', async () => {
    const html = await $fetch('/')
    expect(html).toContain('Menu photo')
    expect(html).toContain('Choose photo')
  })
})
