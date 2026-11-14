import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Buffer } from 'node:buffer'
import type { CompressionConfig, FastifyModernImagesOptions, MinifyQuerystring, MinifyRequest, RembgOptions, ResolvedFastifyModernImagesOptions } from './types'
import { buffer as streamToBuffer } from 'node:stream/consumers'
import fp from 'fastify-plugin'
import sharp from 'sharp'
import { appendVaryHeader, deepMerge, getBestFormat, guard, isMediaTypeAccepted, isStream, removeBackground, validatePayload } from './utils'
import { isNonEmpty, parseBackground, parseDimension, parseFit, parsePosition, parseQuality, parseRotation, parseTrim } from './validation'

const defaults: ResolvedFastifyModernImagesOptions = {
  regex: /.*/,
  quality: '7',
  rembg: {
    enabled: false,
    model: 'isnet-general-use',
    timeoutMs: 30_000,
    concurrency: 2,
  },
  compression: {
    jpeg: {
      enabled: true,
      format: 'jpeg',
      priority: 2,
      alpha: false,
      quality: {
        9: 95,
        8: 90,
        7: 85,
        6: 80,
        5: 75,
        4: 70,
        3: 60,
        2: 50,
        1: 40,
      },
      options: {},
      contentType: 'image/jpeg',
      supported: () => true,
    },
    avif: {
      enabled: true,
      format: 'avif',
      priority: 4,
      alpha: true,
      quality: {
        9: 87,
        8: 79,
        7: 70,
        6: 66,
        5: 61,
        4: 54,
        3: 42,
        2: 38,
        1: 34,
      },
      options: {
        effort: 3,
      },
      contentType: 'image/avif',
      supported: accept => isMediaTypeAccepted(accept, 'image/avif'),
    },
    webp: {
      enabled: true,
      format: 'webp',
      priority: 3,
      alpha: true,
      quality: {
        9: 93,
        8: 89,
        7: 84,
        6: 79,
        5: 74,
        4: 69,
        3: 48,
        2: 38,
        1: 32,
      },
      options: {},
      contentType: 'image/webp',
      supported: accept => isMediaTypeAccepted(accept, 'image/webp'),
    },
    png: {
      enabled: true,
      format: 'png',
      priority: 1,
      alpha: true,
      quality: {
        9: 87,
        8: 78,
        7: 72,
        6: 68,
        5: 63,
        4: 61,
        3: 55,
        2: 52,
        1: 48,
      },
      options: {},
      contentType: 'image/png',
      supported: () => true,
    },
  },
}

function applyResize(instance: sharp.Sharp, query: MinifyQuerystring, background?: string): void {
  const width = parseDimension(query.width ?? query.w)
  const height = parseDimension(query.height ?? query.h)

  if (width === null && height === null) {
    return
  }

  instance.resize(width, height, {
    fit: parseFit(query.fit ?? query.f),
    position: parsePosition(query.position ?? query.p),
    background,
  })
}

function applySharpTransforms(instance: sharp.Sharp, query: MinifyQuerystring): void {
  const background = parseBackground(query.background ?? query.b)
  const rotation = parseRotation(query.rotation ?? query.r)

  // Called unconditionally so sharp auto-orients images from their EXIF orientation tag
  // when rotation is undefined, before EXIF metadata is stripped on output.
  instance.rotate(rotation, { background })
  applyResize(instance, query, background)

  if (isNonEmpty(background)) {
    instance.flatten({ background })
  }
}

async function resolveInputBuffer(
  payload: unknown,
  query: MinifyQuerystring,
  rembg: RembgOptions,
): Promise<{ buffer: Buffer, inputLength: number }> {
  const inputBuffer = isStream(payload)
    ? await streamToBuffer(payload as unknown as NodeJS.ReadableStream)
    : payload as Buffer
  const inputLength = inputBuffer.length

  const ai = query.ai ?? query.a
  if (!rembg.enabled || typeof ai !== 'string') {
    return { buffer: inputBuffer, inputLength }
  }

  const model = ai.length > 0
    ? ai
    : rembg.model
  const buffer = await removeBackground(inputBuffer, model, {
    allowedModels: rembg.allowedModels,
    timeoutMs: rembg.timeoutMs,
    concurrency: rembg.concurrency,
    endpoint: rembg.endpoint,
  })
  return { buffer, inputLength }
}

interface EncodeContext {
  format: CompressionConfig
  options: ResolvedFastifyModernImagesOptions
  inputLength: number
}

async function encodeAndReply(
  instance: sharp.Sharp,
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  context: EncodeContext,
): Promise<Buffer> {
  const { format, options, inputLength } = context
  const quality = parseQuality(request.query.quality ?? request.query.q, format.quality, options.quality)
  const output = await instance.toFormat(format.format, { ...format.options, quality }).toBuffer()

  const inputType = String(reply.getHeader('Content-Type') ?? '')
  const reduction = inputLength > 0
    ? Math.round((1 - output.length / inputLength) * 100)
    : 0
  request.log.info(
    `Input: ${inputType}, Output: ${format.contentType}, Quality: ${String(quality ?? '')}, Reduction: ${reduction}%`,
  )

  reply.header('Content-Type', format.contentType)
  reply.header('Content-Length', output.length)
  reply.header('Vary', appendVaryHeader(reply.getHeader('Vary'), 'Accept'))
  reply.removeHeader('etag')
  reply.removeHeader('accept-ranges')

  return output
}

async function processPayload(
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  payload: unknown,
  options: ResolvedFastifyModernImagesOptions,
): Promise<unknown> {
  const compressionList: CompressionConfig[] = Object.values(options.compression)
  const accept = request.headers.accept ?? ''
  if (!compressionList.some(item => item.enabled && item.supported(accept))) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return payload
  }

  const { buffer, inputLength } = await resolveInputBuffer(payload, request.query, options.rembg)
  const instance = sharp(buffer)

  if (parseTrim(request.query.trim ?? request.query.t)) {
    instance.trim()
  }

  const metadata = await instance.metadata()
  const flattened = isNonEmpty(parseBackground(request.query.background ?? request.query.b))
  const format = getBestFormat(accept, metadata, compressionList, flattened)

  if (format === false) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return buffer
  }

  applySharpTransforms(instance, request.query)
  return encodeAndReply(instance, request, reply, { format, options, inputLength })
}

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options: ResolvedFastifyModernImagesOptions = deepMerge(defaults, opts)
  const contentTypes = Object.values(options.compression).map(item => item.contentType)

  fastify.addHook('onSend', async (request: FastifyRequest<MinifyRequest>, reply, payload) => {
    if (
      request.method !== 'GET'
      || reply.statusCode !== 200
      || !guard(options.regex, request.raw.url)
      || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)
    ) {
      return payload
    }

    return processPayload(request, reply, payload, options)
  })
}

export default fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})
