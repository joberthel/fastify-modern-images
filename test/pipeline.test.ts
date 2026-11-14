import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../src/config'
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
})
