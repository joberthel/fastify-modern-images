import type { CompressionConfig } from '../src/types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough, Stream } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../src/config'
import { computeDerivedEtag, matchesIfNoneMatch } from '../src/negotiation'
import { appendVaryHeader, deepMerge, getBestFormat, guard, isMediaTypeAccepted, isStream, matchesUrlPattern, removeBackground, validatePayload } from '../src/utils'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

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

describe('utils - stream and matchesUrlPattern', () => {
  it('should match url pattern', () => {
    expect(matchesUrlPattern(/\/foo-bar/, '/foo-bar/hello-world.jpg')).toBe(true)
    expect(matchesUrlPattern(/\/foo-bar/, '/bar-foo/hello-world.jpg')).toBe(false)
    expect(matchesUrlPattern(/\/foo-bar/, undefined)).toBe(false)

    const globalRegex = /\/foo-bar/g
    expect(matchesUrlPattern(globalRegex, '/foo-bar/hello-world.jpg')).toBe(true)
    expect(matchesUrlPattern(globalRegex, '/foo-bar/hello-world.jpg')).toBe(true)

    const stickyRegex = /\/foo-bar/y
    expect(matchesUrlPattern(stickyRegex, '/foo-bar/hello-world.jpg')).toBe(true)
    expect(matchesUrlPattern(stickyRegex, '/foo-bar/hello-world.jpg')).toBe(true)

    expect(guard).toBe(matchesUrlPattern)
  })

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

    expect(getBestFormat('image/avif', { hasAlpha: false }, limitedFormats)).toBe(false)
  })

  it('should not convert opaque png to lossy jpeg when no modern format is accepted', () => {
    const formats = createFormats()

    const pngResult = getBestFormat('image/png', { format: 'png', hasAlpha: false }, formats)
    expect(pngResult !== false && pngResult.format).toBe('png')

    const wildcardResult = getBestFormat('*/*', { format: 'png', hasAlpha: false }, formats)
    expect(wildcardResult !== false && wildcardResult.format).toBe('png')

    const noAcceptResult = getBestFormat(undefined, { format: 'png', hasAlpha: false }, formats)
    expect(noAcceptResult !== false && noAcceptResult.format).toBe('png')

    const webpResult = getBestFormat('image/webp,image/png', { format: 'png', hasAlpha: false }, formats)
    expect(webpResult !== false && webpResult.format).toBe('webp')

    const jpegResult = getBestFormat(undefined, { format: 'jpeg', hasAlpha: false }, formats)
    expect(jpegResult !== false && jpegResult.format).toBe('jpeg')
  })

  it('should allow jpeg for alpha png when flattened is true', () => {
    const formats = createFormats()

    const unflattenedResult = getBestFormat('image/jpeg', { format: 'png', hasAlpha: true }, formats, false)
    expect(unflattenedResult !== false && unflattenedResult.format).toBe('png')

    const flattenedResult = getBestFormat('image/jpeg', { format: 'png', hasAlpha: true }, formats, true)
    expect(flattenedResult !== false && flattenedResult.format).toBe('jpeg')
  })
})

describe('utils - isMediaTypeAccepted', () => {
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
})

function createMockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    stderr: PassThrough
  }
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

describe('utils - removeBackground (success and errors)', () => {
  it('should resolve with stdout buffer on success', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const input = Buffer.from('input-image')
    const expectedOutput = Buffer.from('output-image')

    const promise = removeBackground(input, 'u2net')

    expect(spawn).toHaveBeenCalledWith('rembg', ['i', '-m', 'u2net'])

    child.stdout.end(expectedOutput)
    child.stderr.end()
    child.emit('close', 0, null)

    const result = await promise
    expect(result).toEqual(expectedOutput)
  })

  it('should reject when child emits error (e.g. ENOENT)', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))
    const err = Object.assign(new Error('spawn rembg ENOENT'), { code: 'ENOENT' })
    child.emit('error', err)

    await expect(promise).rejects.toThrow('spawn rembg ENOENT')
  })

  it('should reject on non-EPIPE stdin error', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))
    const err = Object.assign(new Error('stdin failed'), { code: 'EIO' })
    child.stdin.emit('error', err)

    await expect(promise).rejects.toThrow('stdin failed')
  })
})

describe('utils - removeBackground (exit codes and signals)', () => {
  it('should reject with exit code and stderr on non-zero exit', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    child.stdout.end()
    child.stderr.end('model not found')
    child.emit('close', 1, null)

    await expect(promise).rejects.toThrow('rembg exited with code 1')
  })

  it('should reject with signal when terminated by signal', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    child.stdout.end()
    child.stderr.end()
    child.emit('close', null, 'SIGKILL')

    await expect(promise).rejects.toThrow('rembg exited with signal SIGKILL')
  })

  it('should ignore stdin EPIPE error and report close exit code', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    const epipeErr = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    child.stdin.emit('error', epipeErr)

    child.stdout.end()
    child.stderr.end('broken pipe')
    child.emit('close', 1, null)

    await expect(promise).rejects.toThrow('rembg exited with code 1')
  })
})

describe('utils - removeBackground (validation, timeout, concurrency, endpoint)', () => {
  it('rejects invalid model names and models not in allowedModels', async () => {
    await expect(removeBackground(Buffer.from('img'), '--help')).rejects.toThrow('Invalid rembg model "--help"')
    await expect(removeBackground(Buffer.from('img'), '../bad')).rejects.toThrow('Invalid rembg model "../bad"')
    await expect(
      removeBackground(Buffer.from('img'), 'u2net', {
        allowedModels: ['isnet-general-use'],
      }),
    ).rejects.toThrow('rembg model "u2net" is not in allowedModels')
  })

  it('times out and kills child process when timeoutMs expires', async () => {
    vi.useFakeTimers()
    const child = createMockChildProcess()
    const killSpy = vi.fn()
    Object.assign(child, { kill: killSpy })
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'), 'u2net', { timeoutMs: 50 })
    vi.advanceTimersByTime(50)

    await expect(promise).rejects.toThrow('rembg timed out after 50ms')
    expect(killSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('rejects when AbortSignal is already aborted or aborts mid-flight', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      removeBackground(Buffer.from('input-image'), 'u2net', { signal: controller.signal }),
    ).rejects.toThrow('cancelled')

    const midController = new AbortController()
    const child = createMockChildProcess()
    const killSpy = vi.fn()
    Object.assign(child, { kill: killSpy })
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'), 'u2net', { signal: midController.signal })
    midController.abort(new Error('aborted mid-flight'))

    await expect(promise).rejects.toThrow('aborted mid-flight')
    expect(killSpy).toHaveBeenCalledTimes(1)
  })

  it('enforces concurrency limit on removeBackground calls', async () => {
    const child1 = createMockChildProcess()
    const child2 = createMockChildProcess()
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as never)
      .mockReturnValueOnce(child2 as never)

    const spawnCallsBefore = vi.mocked(spawn).mock.calls.length
    const p1 = removeBackground(Buffer.from('img1'), 'u2net', { concurrency: 1 })
    const p2 = removeBackground(Buffer.from('img2'), 'u2net', { concurrency: 1 })

    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(1)

    child1.stdout.end('out1')
    child1.stderr.end()
    child1.emit('close', 0, null)
    await expect(p1).resolves.toEqual(Buffer.from('out1'))

    await Promise.resolve()
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(2)

    child2.stdout.end('out2')
    child2.stderr.end()
    child2.emit('close', 0, null)
    await expect(p2).resolves.toEqual(Buffer.from('out2'))
  })

  it('uses HTTP endpoint when configured and handles errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await removeBackground(Buffer.from('img'), 'u2net', {
      endpoint: 'http://localhost:7000/api/remove',
      timeoutMs: 5000,
    })
    expect(result).toEqual(Buffer.from([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7000/api/remove',
      expect.objectContaining({ method: 'POST' }),
    )

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })
    await expect(
      removeBackground(Buffer.from('img'), 'u2net', { endpoint: 'http://localhost:7000/api/remove' }),
    ).rejects.toThrow('rembg endpoint responded with 503 Service Unavailable')

    vi.unstubAllGlobals()
  })
})

describe('appendVaryHeader', () => {
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

describe('deepMerge', () => {
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
