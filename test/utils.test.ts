import type { FastifyModernImagesOptionsCompression } from '../src/types'
import { Buffer } from 'node:buffer'
import { PassThrough, Stream } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { getBestFormat, guard, isStream, stream2buffer, validatePayload } from '../src/utils'

function createFormats(): FastifyModernImagesOptionsCompression[] {
  return [
    {
      enabled: true,
      format: 'jpeg',
      alpha: false,
      priority: 2,
      supported: () => true,
    },
    {
      enabled: false,
      format: 'avif',
      alpha: true,
      priority: 4,
      supported: accept => accept.includes('image/avif'),
    },
    {
      enabled: true,
      format: 'webp',
      alpha: true,
      priority: 3,
      supported: accept => accept.includes('image/webp'),
    },
    {
      enabled: true,
      format: 'png',
      alpha: true,
      priority: 1,
      supported: () => true,
    },
  ]
}

describe('utils - stream and guard', () => {
  it('should convert stream to buffer', async () => {
    let stream = new PassThrough()
    stream.write('foo bar')
    stream.end()

    expect((await stream2buffer(stream)).toString()).toBe('foo bar')

    stream = new PassThrough()
    stream.write('foo bar')
    stream.destroy(new Error('foo-bar'))

    await expect(stream2buffer(stream)).rejects.toThrow('error converting stream - Error: foo-bar')
  })

  it('should guard by url', () => {
    expect(guard(/\/foo-bar/, '/foo-bar/hello-world.jpg')).toBe(true)
    expect(guard(/\/foo-bar/, '/bar-foo/hello-world.jpg')).toBe(false)
    expect(guard(/\/foo-bar/, undefined)).toBe(false)
  })

  it('should validate payload', () => {
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], new PassThrough())).toBe(true)

    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)
    expect(validatePayload('image/avif', ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)
    expect(validatePayload(undefined, ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)

    expect(validatePayload([], ['foo'], 'bar')).toBe(false)
    expect(validatePayload(42, ['foo'], 'bar')).toBe(false)
  })

  it('should check if stream', () => {
    expect(isStream(new Stream())).toBe(true)
    expect(isStream(Buffer.from(''))).toBe(false)
    expect(isStream('')).toBe(false)
  })
})

describe('utils - getBestFormat', () => {
  it('should select best format', () => {
    const formats = createFormats()

    const webpResult = getBestFormat('image/webp,image/avif', { hasAlpha: false }, formats)
    expect(webpResult !== false && webpResult.format).toBe('webp')

    const pngResult = getBestFormat(undefined, { hasAlpha: true }, formats)
    expect(pngResult !== false && pngResult.format).toBe('png')

    const limitedFormats: FastifyModernImagesOptionsCompression[] = [
      {
        enabled: false,
        format: 'avif',
        alpha: true,
        priority: 4,
        supported: accept => accept.includes('image/avif'),
      },
      {
        enabled: true,
        format: 'webp',
        alpha: true,
        priority: 3,
        supported: accept => accept.includes('image/webp'),
      },
    ]

    expect(getBestFormat('image/avif', { hasAlpha: false }, limitedFormats)).toBe(false)
  })
})
