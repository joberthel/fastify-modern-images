import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Buffer } from 'node:buffer'
import type { FastifyModernImagesOptions, FastifyModernImagesOptionsCompression, MinifyQuerystring, MinifyRequest } from './types'
import fp from 'fastify-plugin'
import merge from 'lodash/merge'
import sharp from 'sharp'
import { appendVaryHeader, getBestFormat, guard, isStream, removeBackground, stream2buffer, validatePayload } from './utils'

const defaults: FastifyModernImagesOptions = {
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

function isNonEmpty(value?: string): value is string {
  return value !== undefined && value !== ''
}

function parseIntOrUndefined(value?: string): number | undefined {
  if (!isNonEmpty(value)) {
    return undefined
  }
  return Number.parseInt(value, 10)
}

function parseDimension(value?: string): number | null {
  if (!isNonEmpty(value)) {
    return null
  }
  return Number.parseInt(value, 10) || null
}

function applyResize(instance: sharp.Sharp, query: MinifyQuerystring, background?: string): void {
  const uWidth = query.width ?? query.w
  const uHeight = query.height ?? query.h

  if (!isNonEmpty(uWidth) && !isNonEmpty(uHeight)) {
    return
  }

  instance.resize(parseDimension(uWidth), parseDimension(uHeight), {
    fit: query.fit ?? query.f ?? 'cover',
    position: query.position ?? query.p ?? 'centre',
    background,
  })
}

function applySharpTransforms(instance: sharp.Sharp, query: MinifyQuerystring): void {
  const background = query.background ?? query.b
  const rotation = parseIntOrUndefined(query.rotation ?? query.r)

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
    ? await stream2buffer(payload)
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
  format: FastifyModernImagesOptionsCompression
  options: FastifyModernImagesOptions
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
  const quality = uQuality === undefined
    ? undefined
    : format.quality?.[uQuality]
  const output = await instance.toFormat(format.format!, { ...format.options, quality }).toBuffer()

  const inputType = String(reply.getHeader('Content-Type') ?? '')
  const reduction = Math.round((1 - output.length / inputLength) * 100)
  request.log.info(
    `Input: ${inputType}, Output: ${format.contentType ?? ''}, Quality: ${String(quality ?? '')}, Reduction: ${reduction}%)`,
  )

  if (format.contentType !== undefined) {
    reply.header('Content-Type', format.contentType)
  }
  reply.header('Content-Length', output.length)
  reply.header('Vary', appendVaryHeader(reply.getHeader('Vary'), 'Accept'))

  return output
}

async function processPayload(
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  payload: unknown,
  options: FastifyModernImagesOptions,
): Promise<unknown> {
  const buffer = await resolveInputBuffer(payload, request.query, options.rembg?.model)
  const instance = sharp(buffer)

  if ((request.query.trim ?? request.query.t) !== undefined) {
    instance.trim()
  }

  const metadata = await instance.metadata()
  const compressionList: FastifyModernImagesOptionsCompression[] = Object.values(options.compression ?? {})
  const format = getBestFormat(request.headers.accept, metadata, compressionList)

  if (format === false || format.format === undefined) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return buffer
  }

  applySharpTransforms(instance, request.query)
  return encodeAndReply(instance, request, reply, { format, options, inputLength: buffer.length })
}

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options: FastifyModernImagesOptions = merge({}, defaults, opts)
  const contentTypes = Object.values(options.compression ?? {})
    .map(item => item.contentType)
    .filter((ct): ct is string => ct !== undefined)

  fastify.addHook('onSend', async (request: FastifyRequest<MinifyRequest>, reply, payload) => {
    if (!guard(options.regex ?? /.*/, request.raw.url) || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)) {
      return payload
    }

    return processPayload(request, reply, payload, options)
  })
}

export default fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})
