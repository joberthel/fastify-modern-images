import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Buffer } from 'node:buffer'
import type { CompressionConfig, FastifyModernImagesOptions, MinifyQuerystring, MinifyRequest, ResolvedFastifyModernImagesOptions } from './types'
import { buffer as streamToBuffer } from 'node:stream/consumers'
import fp from 'fastify-plugin'
import sharp from 'sharp'
import { appendVaryHeader, deepMerge, getBestFormat, guard, isStream, removeBackground, validatePayload } from './utils'
import { isNonEmpty, parseBackground, parseDimension, parseFit, parsePosition, parseRotation } from './validation'

const defaults: ResolvedFastifyModernImagesOptions = {
  regex: /.*/,
  quality: '7',
  rembg: {
    model: 'isnet-general-use',
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
      supported: accept => accept.includes('image/avif'),
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
      supported: accept => accept.includes('image/webp'),
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
  defaultModel?: string,
): Promise<Buffer> {
  const buffer = isStream(payload)
    ? await streamToBuffer(payload as unknown as NodeJS.ReadableStream)
    : payload as Buffer

  const ai = query.ai ?? query.a
  if (ai === undefined) {
    return buffer
  }

  const model = ai.length > 0
    ? ai
    : defaultModel
  return removeBackground(buffer, model)
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
  const uQuality = request.query.quality ?? request.query.q ?? options.quality
  const quality = format.quality[String(uQuality)]
  const output = await instance.toFormat(format.format, { ...format.options, quality }).toBuffer()

  const inputType = String(reply.getHeader('Content-Type') ?? '')
  const reduction = Math.round((1 - output.length / inputLength) * 100)
  request.log.info(
    `Input: ${inputType}, Output: ${format.contentType}, Quality: ${String(quality ?? '')}, Reduction: ${reduction}%)`,
  )

  reply.header('Content-Type', format.contentType)
  reply.header('Content-Length', output.length)
  reply.header('Vary', appendVaryHeader(reply.getHeader('Vary'), 'Accept'))
  reply.removeHeader('etag')

  return output
}

async function processPayload(
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  payload: unknown,
  options: ResolvedFastifyModernImagesOptions,
): Promise<unknown> {
  const buffer = await resolveInputBuffer(payload, request.query, options.rembg.model)
  const instance = sharp(buffer)

  if ((request.query.trim ?? request.query.t) !== undefined) {
    instance.trim()
  }

  const metadata = await instance.metadata()
  const compressionList: CompressionConfig[] = Object.values(options.compression)
  const format = getBestFormat(request.headers.accept, metadata, compressionList)

  if (format === false) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return buffer
  }

  applySharpTransforms(instance, request.query)
  return encodeAndReply(instance, request, reply, { format, options, inputLength: buffer.length })
}

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options: ResolvedFastifyModernImagesOptions = deepMerge(defaults, opts)
  const contentTypes = Object.values(options.compression).map(item => item.contentType)

  fastify.addHook('onSend', async (request: FastifyRequest<MinifyRequest>, reply, payload) => {
    if (!guard(options.regex, request.raw.url) || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)) {
      return payload
    }

    return processPayload(request, reply, payload, options)
  })
}

export default fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})
