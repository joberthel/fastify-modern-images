import type { FastifyModernImagesOptionsCompression } from '../src/types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough, Stream } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { appendVaryHeader, getBestFormat, guard, isStream, removeBackground, stream2buffer, validatePayload } from '../src/utils'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

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
