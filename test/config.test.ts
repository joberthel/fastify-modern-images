import { describe, expect, it } from 'vitest'
import { deepMerge, resolveOptions } from '../src/config'

describe('config - resolveOptions', () => {
  it('should resolve urlPattern and legacy regex options', () => {
    const pattern = /^\/images\//
    const fromUrlPattern = resolveOptions({ urlPattern: pattern })
    expect(fromUrlPattern.urlPattern).toBe(pattern)
    expect(fromUrlPattern.regex).toBe(pattern)

    const legacyRegex = /^\/media\//
    const fromRegex = resolveOptions({ regex: legacyRegex })
    expect(fromRegex.urlPattern).toBe(legacyRegex)
    expect(fromRegex.regex).toBe(legacyRegex)
  })

  it('accepts valid quality tiers and valid option overrides', () => {
    for (const tier of ['1', '5', '9', 1, 5, 9] as const) {
      expect(resolveOptions({ quality: tier }).quality).toBe(tier)
    }

    const resolved = resolveOptions({
      maxDimension: 2048,
      allowedDimensions: [320, 640],
      maxInputBytes: 1024,
      withoutEnlargement: false,
      rembg: {
        enabled: true,
        model: 'u2net',
        allowedModels: ['u2net'],
        timeoutMs: 5000,
        concurrency: 1,
        endpoint: 'http://localhost:5000',
      },
      compression: {
        avif: { enabled: false },
        webp: {
          format: 'webp',
          enabled: true,
          priority: 10,
          alpha: true,
          contentType: 'image/webp',
          supported: () => true,
          quality: { 7: 80 },
        },
        jpeg: undefined,
      },
      sharpInputOptions: { sequentialRead: true },
      verifyRequest: () => true,
    })

    expect(resolved.maxDimension).toBe(2048)
    expect(resolved.allowedDimensions).toEqual([320, 640])
    expect(resolved.compression.avif.enabled).toBe(false)
    expect(resolved.compression.webp.quality['7']).toBe(80)
  })

  it('throws a clear error for unknown compression formats', () => {
    expect(() =>
      resolveOptions({
        compression: {
          jpg: { enabled: false },
        } as never,
      }),
    ).toThrow('Invalid compression format "jpg". Supported formats are: avif, webp, jpeg, png')
  })

  it('throws a clear error for invalid compression entries', () => {
    expect(() => resolveOptions({ compression: 'invalid' as never })).toThrow('Invalid compression option')
    expect(() => resolveOptions({
      compression: { jpeg: 'invalid' as never },
    })).toThrow('Invalid compression.jpeg option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { format: 'webp' },
      },
    })).toThrow('Invalid compression.jpeg.format option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { enabled: 'yes' as never },
      },
    })).toThrow('Invalid compression.jpeg.enabled option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { priority: Number.NaN },
      },
    })).toThrow('Invalid compression.jpeg.priority option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { alpha: 1 as never },
      },
    })).toThrow('Invalid compression.jpeg.alpha option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { contentType: '   ' },
      },
    })).toThrow('Invalid compression.jpeg.contentType option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { supported: true as never },
      },
    })).toThrow('Invalid compression.jpeg.supported option')
    expect(() => resolveOptions({
      compression: {
        jpeg: { quality: 'bad' as never },
      },
    })).toThrow('Invalid compression.jpeg.quality option')
    expect(() => resolveOptions({
      compression: {
        jpeg: {
          quality: { 7: 101 },
        },
      },
    })).toThrow('Invalid compression.jpeg.quality["7"] option')
  })

  it('throws a clear error for invalid quality values', () => {
    for (const invalid of ['10', '0', '', 0, 10, 7.5, Number.NaN]) {
      expect(() => resolveOptions({ quality: invalid as never })).toThrow(
        `Invalid quality option "${String(invalid)}". Expected a quality tier from 1 to 9.`,
      )
    }
  })

  it('throws a clear error for invalid top-level and rembg options', () => {
    expect(() => resolveOptions(null as never)).toThrow('Invalid plugin options')
    expect(() => resolveOptions({ urlPattern: '/images/' as never })).toThrow('Invalid urlPattern option')
    expect(() => resolveOptions({ regex: '/images/' as never })).toThrow('Invalid regex option')
    expect(() => resolveOptions({ maxDimension: 0 })).toThrow('Invalid maxDimension option')
    expect(() => resolveOptions({ maxDimension: 1.5 })).toThrow('Invalid maxDimension option')
    expect(() => resolveOptions({
      allowedDimensions: [100, 0],
    })).toThrow('Invalid allowedDimensions option')
    expect(() => resolveOptions({ allowedDimensions: '100' as never })).toThrow('Invalid allowedDimensions option')
    expect(() => resolveOptions({ maxInputBytes: 0 })).toThrow('Invalid maxInputBytes option')
    expect(() => resolveOptions({ maxInputBytes: Number.POSITIVE_INFINITY })).toThrow('Invalid maxInputBytes option')
    expect(() => resolveOptions({ withoutEnlargement: 'true' as never })).toThrow('Invalid withoutEnlargement option')
    expect(() => resolveOptions({ sharpInputOptions: 'bad' as never })).toThrow('Invalid sharpInputOptions option')
    expect(() => resolveOptions({ verifyRequest: true as never })).toThrow('Invalid verifyRequest option')

    expect(() => resolveOptions({ rembg: 'bad' as never })).toThrow('Invalid rembg option')
    expect(() => resolveOptions({
      rembg: { enabled: 1 as never },
    })).toThrow('Invalid rembg.enabled option')
    expect(() => resolveOptions({
      rembg: { model: '' },
    })).toThrow('Invalid rembg.model option')
    expect(() => resolveOptions({
      rembg: {
        allowedModels: [''],
      },
    })).toThrow('Invalid rembg.allowedModels option')
    expect(() => resolveOptions({
      rembg: { timeoutMs: -1 },
    })).toThrow('Invalid rembg.timeoutMs option')
    expect(() => resolveOptions({
      rembg: { concurrency: 1.5 },
    })).toThrow('Invalid rembg.concurrency option')
    expect(() => resolveOptions({
      rembg: { endpoint: '' },
    })).toThrow('Invalid rembg.endpoint option')
  })
})

describe('config - deepMerge', () => {
  it('merges nested plain objects without mutating inputs', () => {
    const defaults = {
      quality: '7',
      compression: {
        jpeg: {
          enabled: true,
          options: { quality: 80 },
        },
        webp: {
          enabled: true,
          options: { quality: 75 },
        },
      },
    }
    const overrides = {
      compression: {
        jpeg: {
          options: { quality: 90 },
        },
      },
    }

    const merged = deepMerge(defaults, overrides)

    expect(merged).toEqual({
      quality: '7',
      compression: {
        jpeg: {
          enabled: true,
          options: { quality: 90 },
        },
        webp: {
          enabled: true,
          options: { quality: 75 },
        },
      },
    })
    expect(defaults.compression.jpeg.options.quality).toBe(80)
    expect(merged.compression).not.toBe(defaults.compression)
    expect(merged.compression.webp).not.toBe(defaults.compression.webp)
    expect(merged.compression.jpeg.options).not.toBe(overrides.compression.jpeg.options)
  })

  it('preserves RegExp, functions, primitives, and arrays without recursing into them', () => {
    const regex = /^\/images\//i
    const supported = (accept: string) => accept.includes('image/webp')
    const tags = ['a', 'b']
    const defaults = {
      regex: /.*/,
      supported: () => false,
      tags: ['x'],
    }

    const merged = deepMerge(defaults, { regex, supported, tags })

    expect(merged.regex).toBe(regex)
    expect(merged.supported).toBe(supported)
    expect(merged.tags).toBe(tags)
  })

  it('skips undefined source values and undefined sources', () => {
    const defaults = {
      quality: '7',
      nested: { a: 1, b: 2 },
    }

    const merged = deepMerge(defaults, undefined, {
      quality: undefined,
      nested: { a: undefined, b: 3 },
    })

    expect(merged).toEqual({
      quality: '7',
      nested: { a: 1, b: 3 },
    })
  })

  it('handles null-prototype plain objects', () => {
    const nullProto = Object.assign(Object.create(null), { a: 1, b: 2 }) as Record<string, number>
    const merged = deepMerge({ nested: nullProto }, {
      nested: { b: 3 },
    })

    expect(merged).toEqual({
      nested: { a: 1, b: 3 },
    })
  })

  it('skips __proto__, constructor, and prototype keys in target and sources', () => {
    const maliciousTarget = JSON.parse('{"safe":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true}}') as Record<string, unknown>
    const maliciousSource = JSON.parse('{"extra":2,"__proto__":{"polluted2":true},"constructor":{"prototype":{"polluted2":true}},"prototype":{"polluted2":true},"nested":{"__proto__":{"polluted3":true},"constructor":{"polluted3":true},"prototype":{"polluted3":true},"ok":true}}') as Record<string, unknown>

    const merged = deepMerge(maliciousTarget, maliciousSource)

    expect(merged).toEqual({
      safe: 1,
      extra: 2,
      nested: { ok: true },
    })
    expect(Object.hasOwn(merged, '__proto__')).toBe(false)
    expect(Object.hasOwn(merged, 'constructor')).toBe(false)
    expect(Object.hasOwn(merged, 'prototype')).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted3).toBeUndefined()
  })
})
