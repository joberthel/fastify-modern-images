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
