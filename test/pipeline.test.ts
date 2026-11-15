import type { CoalescedPipelineResult } from '../src/pipeline'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../src/config'
import * as negotiation from '../src/negotiation'
import { computeDerivedEtag } from '../src/negotiation'
import { InputLimitExceededError, isFatalInputLimitError, processedReplies, processPayload } from '../src/pipeline'
import { normalizeTransformParams, parseQuality } from '../src/validation'

const { sharpMock, removeBackgroundMock, readStreamWithLimitMock } = vi.hoisted(() => ({
  sharpMock: vi.fn(),
  removeBackgroundMock: vi.fn(),
  readStreamWithLimitMock: vi.fn(),
}))

vi.mock('sharp', () => ({
  default: sharpMock,
}))

vi.mock('../src/providers/rembg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/rembg')>()
  return {
    ...actual,
    removeBackground: removeBackgroundMock,
  }
})

vi.mock('../src/stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/stream')>()
  return {
    ...actual,
    readStreamWithLimit: readStreamWithLimitMock,
  }
})

describe('pipeline - isFatalInputLimitError', () => {
  it('returns true for InputLimitExceededError instances', () => {
    const err = new InputLimitExceededError('too many pixels')
    expect(err.name).toBe('InputLimitExceededError')
    expect(isFatalInputLimitError(err)).toBe(true)
  })

  it('returns true for Sharp pixel limit error messages', () => {
    expect(isFatalInputLimitError(new Error('Input image exceeds pixel limit'))).toBe(true)
    expect(isFatalInputLimitError(new Error('input image exceeds PIXEL LIMIT'))).toBe(true)
  })

  it('returns true for generic limit exceeded error messages', () => {
    expect(isFatalInputLimitError(new Error('Payload exceeds size limit'))).toBe(true)
  })

  it('returns false for unrelated errors and non-Error values', () => {
    expect(isFatalInputLimitError(new Error('corrupt jpeg'))).toBe(false)
    expect(isFatalInputLimitError(new Error('stream aborted'))).toBe(false)
    expect(isFatalInputLimitError('pixel limit')).toBe(false)
    expect(isFatalInputLimitError(null)).toBe(false)
    expect(isFatalInputLimitError(undefined)).toBe(false)
  })
})

describe('pipeline - 304 Not Modified short-circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockReply(upstreamEtag?: string) {
    const headers = new Map<string, unknown>()
    if (upstreamEtag !== undefined) {
      headers.set('etag', upstreamEtag)
    }
    headers.set('content-length', '1234')
    headers.set('accept-ranges', 'bytes')

    return {
      code: vi.fn().mockReturnThis(),
      header: vi.fn((key: string, val: unknown) => {
        headers.set(key.toLowerCase(), val)
      }),
      getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
      removeHeader: vi.fn((key: string) => {
        headers.delete(key.toLowerCase())
      }),
      headers,
    }
  }

  it('short-circuits 304 before stream buffering, rembg, and sharp, and destroys the stream', async () => {
    const options = resolveOptions({
      rembg: { enabled: true },
    })
    const upstreamEtag = '"abc123"'
    const params = normalizeTransformParams({}, options.maxDimension, options.allowedDimensions)
    const quality = parseQuality(undefined, options.compression.avif.quality, options.quality)
    const expectedEtag = computeDerivedEtag(upstreamEtag, 'avif', quality, params, options.rembg.model)

    const stream = new PassThrough()
    const destroySpy = vi.spyOn(stream, 'destroy')
    const reply = createMockReply(upstreamEtag)
    const request = {
      headers: {
        'accept': 'image/avif,image/webp,*/*',
        'if-none-match': expectedEtag,
      },
      query: { ai: '' },
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const result = await processPayload(request as never, reply as never, stream, options)

    expect(result).toBe('')
    expect(reply.code).toHaveBeenCalledWith(304)
    expect(reply.header).toHaveBeenCalledWith('ETag', expectedEtag)
    expect(reply.header).toHaveBeenCalledWith('Vary', 'Accept')
    expect(reply.removeHeader).toHaveBeenCalledWith('Content-Length')
    expect(reply.removeHeader).toHaveBeenCalledWith('accept-ranges')
    expect(processedReplies.has(reply as never)).toBe(true)
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(readStreamWithLimitMock).not.toHaveBeenCalled()
    expect(removeBackgroundMock).not.toHaveBeenCalled()
    expect(sharpMock).not.toHaveBeenCalled()
  })

  it('does not short-circuit 304 when aiModel is invalid', async () => {
    const options = resolveOptions({
      rembg: {
        enabled: true,
        allowedModels: ['u2net'],
      },
      compression: {
        avif: { enabled: true },
        webp: { enabled: false },
        jpeg: { enabled: false },
        png: { enabled: false },
      },
    })
    const upstreamEtag = '"abc123"'
    const params = normalizeTransformParams({}, options.maxDimension, options.allowedDimensions)
    const candidateEtag = computeDerivedEtag(upstreamEtag, 'avif', options.compression.avif.quality, params, 'invalid-model')

    const inputBuffer = Buffer.from('raw-image')
    readStreamWithLimitMock.mockResolvedValueOnce(inputBuffer)
    removeBackgroundMock.mockRejectedValueOnce(new Error('Invalid rembg model'))

    const stream = new PassThrough()
    const reply = createMockReply(upstreamEtag)
    const request = {
      headers: {
        'accept': 'image/avif,image/webp,*/*',
        'if-none-match': candidateEtag,
      },
      query: { ai: 'invalid-model' },
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const result = await processPayload(request as never, reply as never, stream, options)

    expect(readStreamWithLimitMock).toHaveBeenCalledTimes(1)
    expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    expect(reply.code).not.toHaveBeenCalledWith(304)
    expect(result).toBe(inputBuffer)
  })

  it('returns original inputBuffer when getBestFormat returns undefined after removeBackground', async () => {
    const options = resolveOptions({
      rembg: {
        enabled: true,
        allowedModels: ['u2net'],
      },
    })

    const inputBuffer = Buffer.from('raw-jpeg-bytes')
    const rembgPngBuffer = Buffer.from('rembg-png-bytes')
    readStreamWithLimitMock.mockResolvedValueOnce(inputBuffer)
    removeBackgroundMock.mockResolvedValueOnce(rembgPngBuffer)
    sharpMock.mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({ width: 100, height: 100, format: 'png' }),
    })
    vi.spyOn(negotiation, 'getBestFormat').mockReturnValueOnce(undefined)

    const stream = new PassThrough()
    const reply = createMockReply('"etag-1"')
    const request = {
      headers: {
        accept: 'image/avif,image/webp,*/*',
      },
      query: { ai: 'u2net' },
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const result = await processPayload(request as never, reply as never, stream, options)

    expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    expect(request.log.warn).toHaveBeenCalledTimes(1)
    expect(result).toBe(inputBuffer)
  })
})

describe('pipeline - request coalescing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockReply(upstreamEtag?: string) {
    const headers = new Map<string, unknown>()
    if (upstreamEtag !== undefined) {
      headers.set('etag', upstreamEtag)
    }
    headers.set('content-type', 'image/jpeg')

    return {
      code: vi.fn().mockReturnThis(),
      header: vi.fn((key: string, val: unknown) => {
        headers.set(key.toLowerCase(), val)
      }),
      getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
      removeHeader: vi.fn((key: string) => {
        headers.delete(key.toLowerCase())
      }),
      headers,
    }
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('coalesces equivalent queries (/test.jpg?w=100 and /test.jpg?width=100) into a single transform/encode call', async () => {
    const options = resolveOptions({})
    const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
    const inputBuffer = Buffer.from('same-image-bytes')
    const encodedBuffer = Buffer.from('encoded-avif')

    const toBufferDeferred = createDeferred<Buffer>()
    const toFormatMock = vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockReturnValue(toBufferDeferred.promise),
    })
    sharpMock.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 200, height: 200, format: 'jpeg' }),
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      toFormat: toFormatMock,
    })

    const req1 = {
      raw: { url: '/test.jpg?w=100' },
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { w: '100' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const req2 = {
      raw: { url: '/test.jpg?width=100' },
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { width: '100' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const p1 = processPayload(req1 as never, createMockReply() as never, inputBuffer, options, inFlight)
    const p2 = processPayload(req2 as never, createMockReply() as never, inputBuffer, options, inFlight)

    await vi.waitFor(() => {
      expect(toFormatMock).toHaveBeenCalledTimes(1)
    })

    toBufferDeferred.resolve(encodedBuffer)
    const [res1, res2] = await Promise.all([p1, p2])

    expect(sharpMock).toHaveBeenCalledTimes(1)
    expect(toFormatMock).toHaveBeenCalledTimes(1)
    expect(res1).toBe(encodedBuffer)
    expect(res2).toBe(encodedBuffer)
    expect(inFlight.size).toBe(0)
  })

  it('does not collide in inFlight when same URL has different inputBuffers or different upstream ETags', async () => {
    const options = resolveOptions({})
    const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()

    const bufferA = Buffer.from('user-a-avatar')
    const bufferB = Buffer.from('user-b-avatar')
    const encodedA = Buffer.from('encoded-a')
    const encodedB = Buffer.from('encoded-b')

    const deferredA = createDeferred<Buffer>()
    const deferredB = createDeferred<Buffer>()

    let callCount = 0
    sharpMock.mockImplementation(() => {
      callCount++
      const targetPromise = callCount === 1
        ? deferredA.promise
        : deferredB.promise
      return {
        metadata: vi.fn().mockResolvedValue({ width: 100, height: 100, format: 'jpeg' }),
        rotate: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFormat: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockReturnValue(targetPromise),
        }),
      }
    })

    const reqA = {
      raw: { url: '/user/avatar?w=100' },
      headers: { accept: 'image/avif' },
      query: { w: '100' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const reqB = {
      raw: { url: '/user/avatar?w=100' },
      headers: { accept: 'image/avif' },
      query: { w: '100' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const pA = processPayload(reqA as never, createMockReply() as never, bufferA, options, inFlight)
    const pB = processPayload(reqB as never, createMockReply() as never, bufferB, options, inFlight)

    await vi.waitFor(() => {
      expect(sharpMock).toHaveBeenCalledTimes(2)
    })

    deferredA.resolve(encodedA)
    deferredB.resolve(encodedB)

    const [resA, resB] = await Promise.all([pA, pB])
    expect(resA).toBe(encodedA)
    expect(resB).toBe(encodedB)
    expect(inFlight.size).toBe(0)
  })

  it('coalesces removeBackground for concurrent identical requests with ?ai=...', async () => {
    const options = resolveOptions({
      rembg: { enabled: true },
    })
    const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
    const inputBuffer = Buffer.from('raw-photo')
    const rembgBuffer = Buffer.from('rembg-png')
    const encodedBuffer = Buffer.from('encoded-avif')

    const rembgDeferred = createDeferred<Buffer>()
    removeBackgroundMock.mockReturnValue(rembgDeferred.promise)

    sharpMock.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 100, height: 100, format: 'png' }),
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      toFormat: vi.fn().mockReturnValue({
        toBuffer: vi.fn().mockResolvedValue(encodedBuffer),
      }),
    })

    const req1 = {
      raw: { url: '/photo.png?ai=u2net' },
      headers: { accept: 'image/avif' },
      query: { ai: 'u2net' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const req2 = {
      raw: { url: '/photo.png?a=u2net' },
      headers: { accept: 'image/avif' },
      query: { a: 'u2net' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const p1 = processPayload(req1 as never, createMockReply('"etag-1"') as never, inputBuffer, options, inFlight)
    const p2 = processPayload(req2 as never, createMockReply('"etag-1"') as never, inputBuffer, options, inFlight)

    await vi.waitFor(() => {
      expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    })

    rembgDeferred.resolve(rembgBuffer)
    const [res1, res2] = await Promise.all([p1, p2])

    expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    expect(sharpMock).toHaveBeenCalledTimes(1)
    expect(res1).toBe(encodedBuffer)
    expect(res2).toBe(encodedBuffer)
    expect(inFlight.size).toBe(0)
  })

  it('aborts removeBackground signal when request.raw emits close before completion and cleans up listener', async () => {
    const options = resolveOptions({
      rembg: { enabled: true },
    })
    const inputBuffer = Buffer.from('raw-photo')
    let rejectRembg!: (err: unknown) => void
    const rembgPromise = new Promise<Buffer>((_resolve, reject) => {
      rejectRembg = reject
    })
    let capturedSignal: AbortSignal | undefined

    removeBackgroundMock.mockImplementationOnce(async (_buf: Buffer, _model: string, opts?: { signal?: AbortSignal }) => {
      capturedSignal = opts?.signal
      return rembgPromise
    })

    const rawReq = Object.assign(new EventEmitter(), {
      url: '/photo.png?ai=u2net',
      destroyed: false,
      complete: false,
    })

    const req = {
      raw: rawReq,
      headers: { accept: 'image/avif' },
      query: { ai: 'u2net' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const reply = {
      ...createMockReply('"etag-1"'),
      raw: { writableEnded: false },
    }

    const pending = processPayload(req as never, reply as never, inputBuffer, options)

    await vi.waitFor(() => {
      expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    })

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal?.aborted).toBe(false)
    expect(rawReq.listenerCount('close')).toBe(1)

    rawReq.destroyed = true
    rawReq.emit('close')

    expect(capturedSignal?.aborted).toBe(true)

    rejectRembg(new DOMException('The operation was aborted.', 'AbortError'))
    const result = await pending
    expect(result).toBe(inputBuffer)
    expect(rawReq.listenerCount('close')).toBe(0)
  })
})

describe('pipeline - animated / multi-page image bypass', () => {
  it('bypasses transformation and returns original inputBuffer when metadata.pages > 1', async () => {
    const toFormatSpy = vi.fn()
    sharpMock.mockImplementation(() => ({
      metadata: vi.fn().mockResolvedValue({
        format: 'webp',
        width: 100,
        height: 100,
        pages: 3,
      }),
      trim: vi.fn().mockReturnThis(),
      toFormat: toFormatSpy,
    }))

    const options = resolveOptions({})
    const inputBuffer = Buffer.from('animated-webp-bytes')
    const req = {
      url: '/animated.webp',
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: {},
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const reply = {
      getHeader: vi.fn().mockReturnValue('image/webp'),
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis(),
    }

    const result = await processPayload(req as never, reply as never, inputBuffer, options)

    expect(result).toBe(inputBuffer)
    expect(toFormatSpy).not.toHaveBeenCalled()
    expect(reply.header).not.toHaveBeenCalled()
    expect(reply.type).not.toHaveBeenCalled()
    expect(reply.code).not.toHaveBeenCalled()
    expect(req.log.warn).not.toHaveBeenCalled()
  })
})

describe('pipeline - coalesced request disconnect handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  function createMockReply() {
    const headers = new Map<string, unknown>([
      ['content-type', 'image/png'],
    ])

    return {
      raw: { writableEnded: false },
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn((key: string, val: unknown) => {
        headers.set(key.toLowerCase(), val)
        return this
      }),
      getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
      removeHeader: vi.fn((key: string) => {
        headers.delete(key.toLowerCase())
      }),
    }
  }

  it('does not abort shared in-flight removeBackground when leader disconnects while follower is waiting', async () => {
    const options = resolveOptions({
      rembg: { enabled: true },
    })
    const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
    const inputBuffer = Buffer.from('input-png')
    const rembgBuffer = Buffer.from('rembg-png')
    const encodedBuffer = Buffer.from('encoded-avif')

    const rembgDeferred = createDeferred<Buffer>()
    let capturedSignal: AbortSignal | undefined
    removeBackgroundMock.mockImplementation(async (_buf, _model, opts) => {
      capturedSignal = opts?.signal
      return rembgDeferred.promise
    })

    sharpMock.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 100, height: 100, format: 'png' }),
      rotate: vi.fn().mockReturnThis(),
      toFormat: vi.fn().mockReturnValue({
        toBuffer: vi.fn().mockResolvedValue(encodedBuffer),
      }),
    })

    const leaderRaw = Object.assign(new EventEmitter(), {
      url: '/photo.png?ai=1',
      destroyed: false,
      complete: true,
    })
    const followerRaw = Object.assign(new EventEmitter(), {
      url: '/photo.png?ai=1',
      destroyed: false,
      complete: true,
    })

    const leaderReq = {
      raw: leaderRaw,
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { ai: '1' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const followerReq = {
      raw: followerRaw,
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { ai: '1' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const pLeader = processPayload(leaderReq as never, createMockReply() as never, inputBuffer, options, inFlight)
    const pFollower = processPayload(followerReq as never, createMockReply() as never, inputBuffer, options, inFlight)

    await vi.waitFor(() => {
      expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    })

    // Leader disconnects while follower is still waiting
    leaderRaw.destroyed = true
    leaderRaw.emit('close')

    expect(capturedSignal?.aborted).toBe(false)

    rembgDeferred.resolve(rembgBuffer)
    const [, followerResult] = await Promise.all([pLeader, pFollower])

    expect(followerResult).toBe(encodedBuffer)
    expect(followerReq.log.error).not.toHaveBeenCalled()
    expect(inFlight.size).toBe(0)
  })

  it('aborts shared in-flight removeBackground when all coalesced waiters disconnect', async () => {
    const options = resolveOptions({
      rembg: { enabled: true },
    })
    const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
    const inputBuffer = Buffer.from('input-png')

    const rembgDeferred = createDeferred<Buffer>()
    let capturedSignal: AbortSignal | undefined
    removeBackgroundMock.mockImplementation(async (_buf, _model, opts) => {
      capturedSignal = opts?.signal
      return rembgDeferred.promise
    })

    const leaderRaw = Object.assign(new EventEmitter(), {
      url: '/photo.png?ai=1',
      destroyed: false,
      complete: true,
    })
    const followerRaw = Object.assign(new EventEmitter(), {
      url: '/photo.png?ai=1',
      destroyed: false,
      complete: true,
    })

    const leaderReq = {
      raw: leaderRaw,
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { ai: '1' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    const followerReq = {
      raw: followerRaw,
      headers: { accept: 'image/avif,image/webp,*/*' },
      query: { ai: '1' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }

    const pLeader = processPayload(leaderReq as never, createMockReply() as never, inputBuffer, options, inFlight)
    const pFollower = processPayload(followerReq as never, createMockReply() as never, inputBuffer, options, inFlight)

    await vi.waitFor(() => {
      expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    })

    leaderRaw.destroyed = true
    leaderRaw.emit('close')
    expect(capturedSignal?.aborted).toBe(false)

    followerRaw.destroyed = true
    followerRaw.emit('close')
    expect(capturedSignal?.aborted).toBe(true)

    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    rembgDeferred.reject(abortErr)

    const [leaderResult, followerResult] = await Promise.all([pLeader, pFollower])
    expect(leaderResult).toBe(inputBuffer)
    expect(followerResult).toBe(inputBuffer)
    expect(inFlight.size).toBe(0)
  })
})
