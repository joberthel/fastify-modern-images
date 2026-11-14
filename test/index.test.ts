import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fastifyModernImages from '../src/index'
import * as utils from '../src/utils'

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
    const spy = vi.spyOn(utils, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
    const onSend = await registerPlugin()

    await onSend(createRequest({
      query: { ai: 'u2net' },
    }), createReply(), Buffer.from('raw'))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('calls removeBackground with default and custom model when rembg is enabled and ai/a query is set', async () => {
    const spy = vi.spyOn(utils, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
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

  it('ignores non-string ai/a query values (e.g. array pollution) when rembg is enabled', async () => {
    const spy = vi.spyOn(utils, 'removeBackground').mockResolvedValue(Buffer.from('no-bg'))
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
})
