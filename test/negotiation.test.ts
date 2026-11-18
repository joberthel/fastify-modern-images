import type { CompressionConfig } from '../src/types'
import { Buffer } from 'node:buffer'
import { PassThrough, Stream } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  appendVaryHeader,
  computeDerivedEtag,
  getBestFormat,
  getMediaTypeQuality,
  isMediaTypeAccepted,
  isStream,
  matchesIfNoneMatch,
  validatePayload,
} from '../src/negotiation'

function createFormats(): CompressionConfig[] {
  return [
    {
      enabled: true,
      format: 'jpeg',
      alpha: false,
      priority: 2,
      quality: {},
      options: {},
      contentType: 'image/jpeg',
      supported: () => true,
    },
    {
      enabled: false,
      format: 'avif',
      alpha: true,
      priority: 4,
      quality: {},
      options: {},
      contentType: 'image/avif',
      supported: accept => accept.includes('image/avif'),
    },
    {
      enabled: true,
      format: 'webp',
      alpha: true,
      priority: 3,
      quality: {},
      options: {},
      contentType: 'image/webp',
      supported: accept => accept.includes('image/webp'),
    },
    {
      enabled: true,
      format: 'png',
      alpha: true,
      priority: 1,
      quality: {},
      options: {},
      contentType: 'image/png',
      supported: () => true,
    },
  ]
}

describe('negotiation - validatePayload & isStream', () => {
  it('should validate payload', () => {
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], new PassThrough())).toBe(true)
    expect(validatePayload('image/jpeg; charset=utf-8', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('IMAGE/JPEG', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('  Image/Png ; charset=utf-8 ', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('image/jpeg', ['IMAGE/JPEG', 'Image/Png'], Buffer.from('foo bar'))).toBe(true)

    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)
    expect(validatePayload('image/avif', ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)
    expect(validatePayload(undefined, ['image/jpeg', 'image/png'], 'foo bar')).toBe(false)

    expect(validatePayload([], ['foo'], 'bar')).toBe(false)
    expect(validatePayload(42, ['foo'], 'bar')).toBe(false)
  })

  it('should validate payload with a pre-normalized Set', () => {
    const validSet = new Set(['image/jpeg', 'image/png'])

    expect(validatePayload('image/jpeg', validSet, Buffer.from('foo bar'))).toBe(true)
    expect(validatePayload('  Image/Png ; charset=utf-8 ', validSet, new PassThrough())).toBe(true)
    expect(validatePayload('image/avif', validSet, Buffer.from('foo bar'))).toBe(false)
    expect(validatePayload('image/jpeg', validSet, 'foo bar')).toBe(false)
  })

  it('should check if stream', () => {
    expect(isStream(new Stream())).toBe(true)
    expect(isStream(Buffer.from(''))).toBe(false)
    expect(isStream('')).toBe(false)
  })
})

describe('negotiation - getBestFormat', () => {
  it('should select best format', () => {
    const formats = createFormats()

    const webpResult = getBestFormat('image/webp,image/avif', { hasAlpha: false }, formats)
    expect(webpResult?.format).toBe('webp')

    const pngResult = getBestFormat(undefined, { hasAlpha: true }, formats)
    expect(pngResult?.format).toBe('png')

    const limitedFormats: CompressionConfig[] = [
      {
        enabled: false,
        format: 'avif',
        alpha: true,
        priority: 4,
        quality: {},
        options: {},
        contentType: 'image/avif',
        supported: accept => accept.includes('image/avif'),
      },
      {
        enabled: true,
        format: 'webp',
        alpha: true,
        priority: 3,
        quality: {},
        options: {},
        contentType: 'image/webp',
        supported: accept => accept.includes('image/webp'),
      },
    ]

    expect(getBestFormat('image/avif', { hasAlpha: false }, limitedFormats)).toBeUndefined()
  })

  it('should not convert opaque png to lossy jpeg when no modern format is accepted', () => {
    const formats = createFormats()

    const pngResult = getBestFormat('image/png', { format: 'png', hasAlpha: false }, formats)
    expect(pngResult?.format).toBe('png')

    const wildcardResult = getBestFormat('*/*', { format: 'png', hasAlpha: false }, formats)
    expect(wildcardResult?.format).toBe('png')

    const noAcceptResult = getBestFormat(undefined, { format: 'png', hasAlpha: false }, formats)
    expect(noAcceptResult?.format).toBe('png')

    const webpResult = getBestFormat('image/webp,image/png', { format: 'png', hasAlpha: false }, formats)
    expect(webpResult?.format).toBe('webp')

    const jpegResult = getBestFormat(undefined, { format: 'jpeg', hasAlpha: false }, formats)
    expect(jpegResult?.format).toBe('jpeg')
  })

  it('should allow jpeg for opaque png when client explicitly accepts image/jpeg', () => {
    const formats = createFormats()

    const jpegAcceptedResult = getBestFormat('image/jpeg', { format: 'png', hasAlpha: false }, formats)
    expect(jpegAcceptedResult?.format).toBe('jpeg')

    const imageWildcardResult = getBestFormat('image/*', { format: 'png', hasAlpha: false }, formats)
    expect(imageWildcardResult?.format).toBe('png')
  })

  it('should allow jpeg for alpha png when flattened is true', () => {
    const formats = createFormats()

    const unflattenedResult = getBestFormat('image/jpeg', { format: 'png', hasAlpha: true }, formats, false)
    expect(unflattenedResult?.format).toBe('png')

    const flattenedResult = getBestFormat('image/jpeg', { format: 'png', hasAlpha: true }, formats, true)
    expect(flattenedResult?.format).toBe('jpeg')
  })

  it('should respect client Accept q-factor weights before breaking ties with priority', () => {
    const formats = createFormats().map(f => (f.format === 'avif'
      ? { ...f, enabled: true }
      : f))

    const webpPreferred = getBestFormat('image/webp;q=1.0, image/avif;q=0.1', { hasAlpha: false }, formats)
    expect(webpPreferred?.format).toBe('webp')

    const tieBrokenByPriority = getBestFormat('image/webp;q=0.8, image/avif;q=0.8', { hasAlpha: false }, formats)
    expect(tieBrokenByPriority?.format).toBe('avif')

    const clampedQ = getBestFormat('image/webp;q=1.5, image/avif;q=1.0', { hasAlpha: false }, formats)
    expect(clampedQ?.format).toBe('avif')
  })

  it('should not convert jpeg to png when Accept prefers image/png over image/*', () => {
    const legacyWebKitAccept = 'image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5'
    const realisticFormats = createFormats().map(f => ({
      ...f,
      supported: (f.format === 'avif' || f.format === 'webp')
        ? (accept: string) => isMediaTypeAccepted(accept, f.contentType)
        : f.supported,
    }))

    const withAvif = realisticFormats.map(f => (f.format === 'avif'
      ? { ...f, enabled: true }
      : f))
    expect(getBestFormat(legacyWebKitAccept, { format: 'jpeg', hasAlpha: false }, withAvif)?.format).toBe('avif')

    expect(getBestFormat(legacyWebKitAccept, { format: 'jpeg', hasAlpha: false }, realisticFormats)?.format).toBe('webp')

    const jpegAndPngOnly = realisticFormats.map(f => (f.format === 'webp'
      ? { ...f, enabled: false }
      : f))
    expect(getBestFormat(legacyWebKitAccept, { format: 'jpeg', hasAlpha: false }, jpegAndPngOnly)?.format).toBe('jpeg')

    expect(getBestFormat('image/png, image/webp;q=0.8', { format: 'jpeg', hasAlpha: false }, realisticFormats)?.format).toBe('webp')
  })

  it('should allow png for jpeg only when no other enabled and accepted format is available', () => {
    const formats = createFormats()

    expect(getBestFormat('image/png', { format: 'jpeg', hasAlpha: false }, formats)?.format).toBe('png')
    expect(getBestFormat('image/jpeg;q=0, image/png', { format: 'jpeg', hasAlpha: false }, formats)?.format).toBe('png')
  })
})

describe('negotiation - isMediaTypeAccepted', () => {
  it('should respect quality weights including q=0', () => {
    expect(isMediaTypeAccepted('', 'image/avif')).toBe(false)
    expect(isMediaTypeAccepted('image/avif', 'image/avif')).toBe(true)
    expect(isMediaTypeAccepted('image/avif;q=0', 'image/avif')).toBe(false)
    expect(isMediaTypeAccepted('image/avif; q=0.0', 'image/avif')).toBe(false)
    expect(isMediaTypeAccepted('image/avif;level=1;q=0', 'image/avif')).toBe(false)
    expect(isMediaTypeAccepted('image/avif;q=0.5', 'image/avif')).toBe(true)
    expect(isMediaTypeAccepted('IMAGE/AVIF;Q=0.8', 'image/avif')).toBe(true)
    expect(isMediaTypeAccepted('image/avif;q=0, image/webp;q=0.8', 'image/avif')).toBe(false)
    expect(isMediaTypeAccepted('image/avif;q=0, image/webp;q=0.8', 'image/webp')).toBe(true)
  })

  it('should clamp q-values to [0, 1] and respect specificity in getMediaTypeQuality', () => {
    expect(getMediaTypeQuality('image/webp;q=1.5', 'image/webp')).toBe(1)
    expect(getMediaTypeQuality('image/webp;q=-0.5', 'image/webp')).toBe(0)
    expect(getMediaTypeQuality('image/webp;q=0.4, image/*;q=0.8, */*;q=0.9', 'image/webp')).toBe(0.4)
    expect(getMediaTypeQuality('image/*;q=0.8, */*;q=0.9', 'image/webp')).toBe(0.8)
    expect(getMediaTypeQuality('*/*;q=0.9', 'image/webp')).toBe(0.9)
  })
})

describe('negotiation - appendVaryHeader', () => {
  it('returns the value when no existing Vary header is present', () => {
    expect(appendVaryHeader(undefined, 'Accept')).toBe('Accept')
    expect(appendVaryHeader('', 'Accept')).toBe('Accept')
  })

  it('appends to an existing string or comma-separated Vary header', () => {
    expect(appendVaryHeader('Origin', 'Accept')).toBe('Origin, Accept')
    expect(appendVaryHeader('Origin, Accept-Encoding', 'Accept')).toBe('Origin, Accept-Encoding, Accept')
  })

  it('appends to an existing array Vary header', () => {
    expect(appendVaryHeader(['Origin', 'Accept-Encoding'], 'Accept')).toBe('Origin, Accept-Encoding, Accept')
  })

  it('does not duplicate Accept case-insensitively', () => {
    expect(appendVaryHeader('Accept', 'Accept')).toBe('Accept')
    expect(appendVaryHeader('Origin, accept', 'Accept')).toBe('Origin, accept')
    expect(appendVaryHeader(['Origin', 'ACCEPT'], 'Accept')).toBe('Origin, ACCEPT')
  })
})

describe('negotiation - computeDerivedEtag & matchesIfNoneMatch', () => {
  it('computes deterministic weak ETag incorporating format, quality, and normalized params', () => {
    const e1 = computeDerivedEtag('"abc"', 'webp', 80, { width: '100', fit: 'cover' })
    const e2 = computeDerivedEtag('"abc"', 'webp', 80, { w: '100', f: 'cover' })
    const e3 = computeDerivedEtag('"abc"', 'avif', 80, { width: '100', fit: 'cover' })
    const e4 = computeDerivedEtag('"def"', 'webp', 80, { width: '100', fit: 'cover' })

    expect(e1).toMatch(/^W\/"[\w-]+"$/)
    expect(e1).toBe(e2)
    expect(e1).not.toBe(e3)
    expect(e1).not.toBe(e4)
  })

  it('produces the same ETag for disallowed dimensions as omitted dimensions when allowedDimensions is set', () => {
    const allowed = [40, 80]
    const omitted = computeDerivedEtag('"abc"', 'webp', 80, {}, undefined, undefined, allowed)
    const disallowed = computeDerivedEtag('"abc"', 'webp', 80, { w: '50' }, undefined, undefined, allowed)
    const allowedMatch = computeDerivedEtag('"abc"', 'webp', 80, { w: '40' }, undefined, undefined, allowed)

    expect(disallowed).toBe(omitted)
    expect(allowedMatch).not.toBe(omitted)
  })

  it('matches If-None-Match headers with weak comparison, lists, and wildcard', () => {
    const etag = 'W/"xyz123"'
    expect(matchesIfNoneMatch(undefined, etag)).toBe(false)
    expect(matchesIfNoneMatch('*', etag)).toBe(true)
    expect(matchesIfNoneMatch('W/"xyz123"', etag)).toBe(true)
    expect(matchesIfNoneMatch('"xyz123"', etag)).toBe(true)
    expect(matchesIfNoneMatch('"other", W/"xyz123"', etag)).toBe(true)
    expect(matchesIfNoneMatch(['"other"', '"xyz123"'], etag)).toBe(true)
    expect(matchesIfNoneMatch('"other"', etag)).toBe(false)
  })
})
