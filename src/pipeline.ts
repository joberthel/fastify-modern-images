import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Buffer } from 'node:buffer'
import type { CompressionConfig, MinifyQuerystring, MinifyRequest, RembgOptions, ResolvedFastifyModernImagesOptions } from './types'
import { buffer as streamToBuffer } from 'node:stream/consumers'
import sharp from 'sharp'
import { appendVaryHeader, computeDerivedEtag, getBestFormat, isStream, matchesIfNoneMatch } from './negotiation'
import { removeBackground } from './providers/rembg'
import { isNonEmpty, parseBackground, parseDimension, parseFit, parsePosition, parseQuality, parseRotation, parseTrim } from './validation'

export const processedReplies = new WeakSet<FastifyReply>()

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
  quality: number | undefined
  derivedEtag: string | undefined
}

async function encodeWithCoalescing(
  instance: sharp.Sharp,
  request: FastifyRequest<MinifyRequest>,
  format: CompressionConfig,
  quality: number | undefined,
  inFlight?: Map<string, Promise<Buffer>>,
): Promise<Buffer> {
  const runEncode = async (): Promise<Buffer> => {
    applySharpTransforms(instance, request.query)
    return instance.toFormat(format.format, { ...format.options, quality }).toBuffer()
  }

  if (!inFlight) {
    return runEncode()
  }

  const key = `${request.raw.url ?? ''}:${format.format}:${String(quality ?? '')}`
  let promise = inFlight.get(key)
  if (!promise) {
    promise = runEncode()
    inFlight.set(key, promise)
  }

  try {
    return await promise
  }
  finally {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key)
    }
  }
}

async function encodeAndReply(
  instance: sharp.Sharp,
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  context: EncodeContext,
  inFlight?: Map<string, Promise<Buffer>>,
): Promise<Buffer> {
  const { format, inputLength, quality, derivedEtag } = context
  const output = await encodeWithCoalescing(instance, request, format, quality, inFlight)

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
  if (derivedEtag !== undefined) {
    reply.header('ETag', derivedEtag)
  }
  else {
    reply.removeHeader('etag')
  }
  reply.removeHeader('accept-ranges')

  processedReplies.add(reply)

  return output
}

export async function processPayload(
  request: FastifyRequest<MinifyRequest>,
  reply: FastifyReply,
  payload: unknown,
  options: ResolvedFastifyModernImagesOptions,
  inFlight?: Map<string, Promise<Buffer>>,
): Promise<unknown> {
  const compressionList: CompressionConfig[] = Object.values(options.compression)
  const accept = request.headers.accept ?? ''
  if (!compressionList.some(item => item.enabled && item.supported(accept))) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return payload
  }

  const { buffer, inputLength } = await resolveInputBuffer(payload, request.query, options.rembg)
  const instance = sharp(buffer, options.sharpInputOptions)

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

  const quality = parseQuality(request.query.quality ?? request.query.q, format.quality, options.quality)
  const ai = request.query.ai ?? request.query.a
  const aiModel = options.rembg.enabled && typeof ai === 'string'
    ? (ai.length > 0
        ? ai
        : options.rembg.model)
    : undefined
  const upstreamEtag = reply.getHeader('etag')
  const derivedEtag = typeof upstreamEtag === 'string' && upstreamEtag.length > 0
    ? computeDerivedEtag(upstreamEtag, format.format, quality, request.query, aiModel)
    : undefined

  if (derivedEtag !== undefined && matchesIfNoneMatch(request.headers['if-none-match'], derivedEtag)) {
    reply.code(304)
    reply.header('ETag', derivedEtag)
    reply.header('Vary', appendVaryHeader(reply.getHeader('Vary'), 'Accept'))
    reply.removeHeader('Content-Length')
    reply.removeHeader('accept-ranges')
    processedReplies.add(reply)
    return ''
  }

  return encodeAndReply(instance, request, reply, {
    format,
    options,
    inputLength,
    quality,
    derivedEtag,
  }, inFlight)
}
