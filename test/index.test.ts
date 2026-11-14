import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fastifyModernImages from '../src/index'
import * as rembg from '../src/providers/rembg'

const mockSharpInstance = {
  trim: vi.fn().mockReturnThis(),
  metadata: vi.fn(),
  rotate: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  flatten: vi.fn().mockReturnThis(),
  toFormat: vi.fn(),
}

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}))

type OnSendHook = (request: any, reply: any, payload: unknown) => Promise<unknown>

async function registerPlugin(opts = {}): Promise<OnSendHook> {
  let hook: OnSendHook | undefined
  const fakeFastify = {
    addHook: vi.fn((_name: string, fn: OnSendHook) => {
      hook = fn
    }),
  }
  await fastifyModernImages(fakeFastify as any, opts)
  return hook!
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    raw: { url: '/image.jpg' },
    query: {},
    headers: { accept: 'image/webp' },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    ...overrides,
  }
}

function createReply(contentType = 'image/jpeg') {
  const headers = new Map<string, unknown>([
    ['content-type', contentType],
  ])
  return {
    statusCode: 200,
    getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
    header: vi.fn((key: string, val: unknown) => {
      headers.set(key.toLowerCase(), val)
    }),
    removeHeader: vi.fn((key: string) => {
      headers.delete(key.toLowerCase())
    }),
  }
}

describe('fastifyModernImages unit tests - passthrough and input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSharpInstance.metadata.mockResolvedValue({ hasAlpha: false })
    mockSharpInstance.toFormat.mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('encoded')),
    })
  })

  it('passes through when url does not match regex', async () => {
    const onSend = await registerPlugin({ regex: /^\/images\// })
    const payload = Buffer.from('raw')
    const result = await onSend(createRequest({
      raw: { url: '/other/a.jpg' },
    }), createReply(), payload)
    expect(result).toBe(payload)
  })

  it('passes through when payload or content-type is invalid', async () => {
    const onSend = await registerPlugin()
    const result = await onSend(createRequest(), createReply('text/plain'), 'hello')
    expect(result).toBe('hello')
  })

  it('reads stream payloads into a buffer', async () => {
    const onSend = await registerPlugin()
    const stream = Readable.from([
      Buffer.from('chunk-1'),
      Buffer.from('chunk-2'),
    ])
    const result = await onSend(createRequest(), createReply(), stream)
    expect(result).toEqual(Buffer.from('encoded'))
  })

  it('ignores ai/a query when rembg is disabled by default', async () => {
    const spy = vi.spyOn(rembg, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
    const onSend = await registerPlugin()

    await onSend(createRequest({
      query: { ai: 'u2net' },
    }), createReply(), Buffer.from('raw'))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('calls removeBackground with default and custom model when rembg is enabled and ai/a query is set', async () => {
    const spy = vi.spyOn(rembg, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
    const onSend = await registerPlugin({
      rembg: { enabled: true, model: 'u2net' },
    })

    await onSend(createRequest({
      query: { ai: '' },
    }), createReply(), Buffer.from('raw'))
    expect(spy).toHaveBeenCalledWith(Buffer.from('raw'), 'u2net', expect.objectContaining({
      timeoutMs: 30_000,
      concurrency: 2,
    }))

    await onSend(createRequest({
      query: { a: 'isnet' },
    }), createReply(), Buffer.from('raw'))
    expect(spy).toHaveBeenCalledWith(Buffer.from('raw'), 'isnet', expect.objectContaining({
      timeoutMs: 30_000,
      concurrency: 2,
    }))
    spy.mockRestore()
  })

  it('measures reduction against original inputLength before removeBackground', async () => {
    const spy = vi.spyOn(rembg, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
    const onSend = await registerPlugin({
      rembg: { enabled: true, model: 'u2net' },
    })

    // Original input is 14 bytes ('original-image'), output from mock sharp is 7 bytes ('encoded') -> 50% reduction
    // If measured after removeBackground ('no-bg' = 5 bytes), it would be -40%
    const request = createRequest({
      query: { ai: '' },
    })
    await onSend(request, createReply(), Buffer.from('original-image'))
    expect(request.log.info).toHaveBeenCalledWith(expect.stringContaining('Reduction: 50%'))
    spy.mockRestore()
  })

  it('logs 0% reduction when inputLength is 0', async () => {
    const onSend = await registerPlugin()
    const request = createRequest()
    await onSend(request, createReply(), Buffer.alloc(0))
    expect(request.log.info).toHaveBeenCalledWith(expect.stringContaining('Reduction: 0%'))
  })

  it('ignores non-string ai/a query values (e.g. array pollution) when rembg is enabled', async () => {
    const spy = vi.spyOn(rembg, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
    const onSend = await registerPlugin({
      rembg: { enabled: true, model: 'u2net' },
    })

    await onSend(createRequest({
      query: {
        ai: ['u2net', 'isnet'] as unknown as string,
      },
    }), createReply(), Buffer.from('raw'))
    expect(spy).not.toHaveBeenCalled()

    await onSend(createRequest({
      query: {
        a: ['u2net', 'isnet'] as unknown as string,
      },
    }), createReply(), Buffer.from('raw'))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('fastifyModernImages unit tests - transforms and encoding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSharpInstance.metadata.mockResolvedValue({ hasAlpha: false })
    mockSharpInstance.toFormat.mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('encoded')),
    })
  })

  it('applies trim, rotate, resize, flatten, and sets response headers', async () => {
    const onSend = await registerPlugin()
    const req = createRequest({
      query: {
        t: '',
        width: '100',
        height: '200',
        fit: 'contain',
        position: 'top',
        background: 'red',
        rotation: '90',
        q: '9',
      },
    })
    const reply = createReply('image/jpeg')

    const result = await onSend(req, reply, Buffer.from('0123456789abcdef'))
    expect(result).toEqual(Buffer.from('encoded'))
    expect(mockSharpInstance.trim).toHaveBeenCalledTimes(1)
    expect(mockSharpInstance.rotate).toHaveBeenCalledWith(90, { background: 'red' })
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(100, 200, { fit: 'contain', position: 'top', background: 'red' })
    expect(mockSharpInstance.flatten).toHaveBeenCalledWith({ background: 'red' })
    expect(mockSharpInstance.toFormat).toHaveBeenCalledWith('webp', { quality: 93 })
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
    expect(reply.header).toHaveBeenCalledWith('Content-Length', 7)
    expect(reply.header).toHaveBeenCalledWith('Vary', 'Accept')
    expect(reply.removeHeader).toHaveBeenCalledWith('etag')
    expect(req.log.info).toHaveBeenCalledTimes(1)
  })

  it('skips resize and flatten when dimensions and background are absent', async () => {
    const onSend = await registerPlugin()
    await onSend(createRequest(), createReply(), Buffer.from('raw'))
    expect(mockSharpInstance.rotate).toHaveBeenCalledWith(undefined, { background: undefined })
    expect(mockSharpInstance.resize).not.toHaveBeenCalled()
    expect(mockSharpInstance.flatten).not.toHaveBeenCalled()
  })

  it('logs warning and returns buffer when no adequate format is found', async () => {
    const onSend = await registerPlugin({
      compression: {
        jpeg: { enabled: false, format: 'jpeg' },
        avif: { enabled: false, format: 'avif' },
        webp: { enabled: false, format: 'webp' },
        png: { enabled: false, format: 'png' },
      },
    })
    const req = createRequest()
    const buf = Buffer.from('raw')
    const result = await onSend(req, createReply('image/jpeg'), buf)
    expect(result).toBe(buf)
    expect(req.log.warn).toHaveBeenCalledWith('No adequate format for image of type "image/jpeg" was found.')
  })

  it('ignores false, 0, and non-string values for trim and t', async () => {
    const onSend = await registerPlugin()
    for (const query of [
      { trim: 'false' },
      { trim: '0' },
      { t: 'false' },
      { t: '0' },
      {
        trim: ['true'] as unknown as string,
      },
    ]) {
      mockSharpInstance.trim.mockClear()
      await onSend(createRequest({ query }), createReply('image/jpeg'), Buffer.from('raw'))
      expect(mockSharpInstance.trim).not.toHaveBeenCalled()
    }
  })

  it('skips second onSend hook when reply was already transformed', async () => {
    const onSend1 = await registerPlugin()
    const onSend2 = await registerPlugin()
    const req = createRequest()
    const reply = createReply('image/jpeg')

    const firstResult = await onSend1(req, reply, Buffer.from('raw'))
    expect(firstResult).toEqual(Buffer.from('encoded'))
    expect(mockSharpInstance.toFormat).toHaveBeenCalledTimes(1)

    const secondResult = await onSend2(req, reply, firstResult)
    expect(secondResult).toBe(firstResult)
    expect(mockSharpInstance.toFormat).toHaveBeenCalledTimes(1)
  })

  it('allows second onSend hook when first hook did not transform', async () => {
    const onSend1 = await registerPlugin({ regex: /^\/other\// })
    const onSend2 = await registerPlugin()
    const req = createRequest({
      raw: { url: '/image.jpg' },
    })
    const reply = createReply('image/jpeg')
    const raw = Buffer.from('raw')

    const firstResult = await onSend1(req, reply, raw)
    expect(firstResult).toBe(raw)
    expect(mockSharpInstance.toFormat).not.toHaveBeenCalled()

    const secondResult = await onSend2(req, reply, firstResult)
    expect(secondResult).toEqual(Buffer.from('encoded'))
    expect(mockSharpInstance.toFormat).toHaveBeenCalledTimes(1)
  })

  it('sets derived ETag when upstream ETag is present and returns 304 on If-None-Match', async () => {
    const onSend = await registerPlugin()
    const reply1 = createReply('image/jpeg')
    reply1.getHeader = vi.fn((name: string) => {
      if (name === 'Content-Type')
        return 'image/jpeg'
      if (name === 'etag')
        return '"upstream-123"'
      return undefined
    })

    const res1 = await onSend(createRequest(), reply1, Buffer.from('raw'))
    expect(res1).toEqual(Buffer.from('encoded'))
    const etagCall = vi.mocked(reply1.header).mock.calls.find(call => call[0] === 'ETag')
    expect(etagCall).toBeDefined()
    const derivedEtag = etagCall![1] as string
    expect(derivedEtag).toMatch(/^W\/"[\w-]+"$/)

    mockSharpInstance.toFormat.mockClear()
    const reply2 = createReply('image/jpeg') as ReturnType<typeof createReply> & { code: ReturnType<typeof vi.fn> }
    reply2.code = vi.fn()
    reply2.getHeader = vi.fn((name: string) => {
      if (name === 'Content-Type')
        return 'image/jpeg'
      if (name === 'etag')
        return '"upstream-123"'
      return undefined
    })
    const req2 = createRequest({
      headers: {
        'accept': 'image/webp',
        'if-none-match': derivedEtag,
      },
    })

    const res2 = await onSend(req2, reply2, Buffer.from('raw'))
    expect(res2).toBe('')
    expect(reply2.code).toHaveBeenCalledWith(304)
    expect(reply2.header).toHaveBeenCalledWith('ETag', derivedEtag)
    expect(mockSharpInstance.toFormat).not.toHaveBeenCalled()
  })

  it('coalesces concurrent identical requests and cleans up on error', async () => {
    const onSend = await registerPlugin()
    let resolveEncode!: (val: Buffer) => void
    mockSharpInstance.toFormat.mockReturnValueOnce({
      toBuffer: vi.fn(async () => new Promise<Buffer>((resolve) => {
        resolveEncode = resolve
      })),
    })

    const p1 = onSend(createRequest({
      raw: { url: '/same.jpg?w=50' },
    }), createReply('image/jpeg'), Buffer.from('raw'))
    const p2 = onSend(createRequest({
      raw: { url: '/same.jpg?w=50' },
    }), createReply('image/jpeg'), Buffer.from('raw'))

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockSharpInstance.toFormat).toHaveBeenCalledTimes(1)

    resolveEncode(Buffer.from('coalesced'))
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(Buffer.from('coalesced'))
    expect(r2).toEqual(Buffer.from('coalesced'))

    mockSharpInstance.toFormat.mockClear()
    mockSharpInstance.toFormat.mockReturnValueOnce({
      toBuffer: vi.fn().mockRejectedValueOnce(new Error('encode failed')),
    })
    await expect(
      onSend(createRequest({
        raw: { url: '/fail.jpg' },
      }), createReply('image/jpeg'), Buffer.from('raw')),
    ).rejects.toThrow('encode failed')

    mockSharpInstance.toFormat.mockReturnValueOnce({
      toBuffer: vi.fn().mockResolvedValueOnce(Buffer.from('recovered')),
    })
    const recovered = await onSend(
      createRequest({
        raw: { url: '/fail.jpg' },
      }),
      createReply('image/jpeg'),
      Buffer.from('raw'),
    )
    expect(recovered).toEqual(Buffer.from('recovered'))
  })

  it('passes sharpInputOptions to sharp constructor', async () => {
    const sharpModule = await import('sharp')
    const sharpMock = vi.mocked(sharpModule.default)
    sharpMock.mockClear()

    const sharpInputOptions = { limitInputPixels: 1000, failOn: 'error' as const, sequentialRead: true }
    const onSend = await registerPlugin({ sharpInputOptions })
    const raw = Buffer.from('raw')
    await onSend(createRequest(), createReply('image/jpeg'), raw)

    expect(sharpMock).toHaveBeenCalledWith(raw, sharpInputOptions)
  })
})
