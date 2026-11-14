import type { CompressionConfig } from '../src/types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough, Stream } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { appendVaryHeader, deepMerge, getBestFormat, guard, isStream, removeBackground, validatePayload } from '../src/utils'

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

describe('utils - stream and guard', () => {
  it('should guard by url', () => {
    expect(guard(/\/foo-bar/, '/foo-bar/hello-world.jpg')).toBe(true)
    expect(guard(/\/foo-bar/, '/bar-foo/hello-world.jpg')).toBe(false)
    expect(guard(/\/foo-bar/, undefined)).toBe(false)
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

    await expect(promise).rejects.toThrow('rembg exited with code 1: model not found')
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

    await expect(promise).rejects.toThrow('rembg exited with code 1: broken pipe')
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
})
