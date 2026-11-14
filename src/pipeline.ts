import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ConcurrencyLimiter } from './providers/rembg'
import type { CompressionConfig, ImageTransformRequest, ResolvedFastifyModernImagesOptions } from './types'
import type { NormalizedTransformParams } from './validation'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { appendVaryHeader, computeDerivedEtag, getBestFormat, isStream, matchesIfNoneMatch } from './negotiation'
import { removeBackground, validateRembgModel } from './providers/rembg'
import { readStreamWithLimit } from './stream'
import { isNonEmptyString, normalizeTransformParams, parseQuality } from './validation'

export const processedReplies = new WeakSet<FastifyReply>()

/**
 * Error thrown when an input image exceeds configured resource limits (e.g. pixel count).
 */
export class InputLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputLimitExceededError'
  }
}

/**
 * Returns true if the error represents a fatal input-limit violation that should
 * propagate as an HTTP 500 rather than falling back to the unoptimized buffer.
 */
export function isFatalInputLimitError(err: unknown): boolean {
  if (err instanceof InputLimitExceededError) {
    return true
  }
  if (!(err instanceof Error)) {
    return false
  }
  const msg = err.message.toLowerCase()
  return msg.includes('pixel limit') || (msg.includes('exceeds') && msg.includes('limit'))
}

function applyResize(
  instance: sharp.Sharp,
  params: NormalizedTransformParams,
  options: Pick<ResolvedFastifyModernImagesOptions, 'withoutEnlargement'>,
): void {
  if (params.width === null && params.height === null) {
    return
  }

  instance.resize(params.width, params.height, {
    fit: params.fit,
    position: params.position,
    background: params.background,
    withoutEnlargement: options.withoutEnlargement,
  })
}

function applySharpTransforms(
  instance: sharp.Sharp,
  params: NormalizedTransformParams,
  options: Pick<ResolvedFastifyModernImagesOptions, 'withoutEnlargement'>,
): void {
  // Called unconditionally so sharp auto-orients images from their EXIF orientation tag
  // when rotation is undefined, before EXIF metadata is stripped on output.
  instance.rotate(params.rotation, { background: params.background })
  applyResize(instance, params, options)

  if (isNonEmptyString(params.background)) {
    instance.flatten({ background: params.background })
  }
}

async function readInputBuffer(
  payload: unknown,
  maxInputBytes: number,
): Promise<Buffer> {
  if (isStream(payload)) {
    return readStreamWithLimit(payload as unknown as NodeJS.ReadableStream, maxInputBytes)
  }

  const inputBuffer = payload as Buffer
  if (Buffer.isBuffer(inputBuffer) && inputBuffer.length > maxInputBytes) {
    throw new Error(`Input buffer exceeded maximum allowed size of ${maxInputBytes} bytes`)
  }
  return inputBuffer
}

interface EncodeContext {
  format: CompressionConfig
  options: ResolvedFastifyModernImagesOptions
  inputLength: number
  quality: number | undefined
  derivedEtag: string | undefined
  params: NormalizedTransformParams
}

async function encodeWithCoalescing(
  instance: sharp.Sharp,
  request: FastifyRequest<ImageTransformRequest>,
  format: CompressionConfig,
  quality: number | undefined,
  options: ResolvedFastifyModernImagesOptions,
  params: NormalizedTransformParams,
  inFlight?: Map<string, Promise<Buffer>>,
): Promise<Buffer> {
  const runEncode = async (): Promise<Buffer> => {
    applySharpTransforms(instance, params, options)
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
  request: FastifyRequest<ImageTransformRequest>,
  reply: FastifyReply,
  context: EncodeContext,
  inFlight?: Map<string, Promise<Buffer>>,
): Promise<Buffer> {
  const { format, options, inputLength, quality, derivedEtag, params } = context
  const output = await encodeWithCoalescing(instance, request, format, quality, options, params, inFlight)

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

function sendNotModified(reply: FastifyReply, etag: string): string {
  reply.code(304)
  reply.header('ETag', etag)
  reply.header('Vary', appendVaryHeader(reply.getHeader('Vary'), 'Accept'))
  reply.removeHeader('Content-Length')
  reply.removeHeader('accept-ranges')
  processedReplies.add(reply)
  return ''
}

function findMatchingDerivedEtag(
  upstreamEtag: unknown,
  ifNoneMatch: unknown,
  accept: string,
  compressionList: CompressionConfig[],
  request: FastifyRequest<ImageTransformRequest>,
  options: ResolvedFastifyModernImagesOptions,
  params: NormalizedTransformParams,
  aiModel: string | undefined,
): string | undefined {
  if (
    typeof upstreamEtag !== 'string'
    || upstreamEtag.length === 0
    || typeof ifNoneMatch !== 'string'
    || ifNoneMatch.length === 0
  ) {
    return undefined
  }

  if (aiModel !== undefined) {
    try {
      validateRembgModel(aiModel, options.rembg.allowedModels)
    }
    catch {
      return undefined
    }
  }

  for (const item of compressionList) {
    if (!item.enabled || !item.supported(accept)) {
      continue
    }
    const quality = parseQuality(request.query.quality ?? request.query.q, item.quality, options.quality)
    const candidateEtag = computeDerivedEtag(upstreamEtag, item.format, quality, params, aiModel)
    if (matchesIfNoneMatch(ifNoneMatch, candidateEtag)) {
      return candidateEtag
    }
  }

  return undefined
}

export async function processPayload(
  request: FastifyRequest<ImageTransformRequest>,
  reply: FastifyReply,
  payload: unknown,
  options: ResolvedFastifyModernImagesOptions,
  inFlight?: Map<string, Promise<Buffer>>,
  rembgLimiter?: ConcurrencyLimiter,
): Promise<unknown> {
  const compressionList: CompressionConfig[] = Object.values(options.compression)
  const accept = request.headers.accept ?? ''
  if (!compressionList.some(item => item.enabled && item.supported(accept))) {
    const inputType = String(reply.getHeader('Content-Type') ?? '')
    request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
    return payload
  }

  const params = normalizeTransformParams(request.query, options.maxDimension, options.allowedDimensions)
  const ai = request.query.ai ?? request.query.a
  const aiModel = options.rembg.enabled && typeof ai === 'string'
    ? (ai.length > 0
        ? ai
        : options.rembg.model)
    : undefined

  const upstreamEtag = reply.getHeader('etag')
  const earlyMatchedEtag = findMatchingDerivedEtag(
    upstreamEtag,
    request.headers['if-none-match'],
    accept,
    compressionList,
    request,
    options,
    params,
    aiModel,
  )
  if (earlyMatchedEtag !== undefined) {
    if (isStream(payload)) {
      ;(payload as { destroy?: () => void }).destroy?.()
    }
    return sendNotModified(reply, earlyMatchedEtag)
  }

  const inputBuffer = await readInputBuffer(payload, options.maxInputBytes)
  const inputLength = inputBuffer.length

  try {
    const buffer = aiModel !== undefined
      ? await removeBackground(inputBuffer, aiModel, {
          allowedModels: options.rembg.allowedModels,
          timeoutMs: options.rembg.timeoutMs,
          concurrency: options.rembg.concurrency,
          limiter: rembgLimiter,
          endpoint: options.rembg.endpoint,
          maxOutputBytes: options.maxInputBytes,
        })
      : inputBuffer

    const instance = sharp(buffer, options.sharpInputOptions)

    if (params.trim) {
      instance.trim()
    }

    const metadata = await instance.metadata()
    const pixelLimit = options.sharpInputOptions?.limitInputPixels
    if (
      typeof pixelLimit === 'number'
      && pixelLimit > 0
      && metadata.width !== undefined
      && metadata.height !== undefined
      && metadata.width * metadata.height > pixelLimit
    ) {
      throw new InputLimitExceededError(
        `Input image exceeds pixel limit (${metadata.width * metadata.height} > ${pixelLimit})`,
      )
    }
    const flattened = isNonEmptyString(params.background)
    const format = getBestFormat(accept, metadata, compressionList, flattened)

    if (format === undefined) {
      const inputType = String(reply.getHeader('Content-Type') ?? '')
      request.log.warn(`No adequate format for image of type "${inputType}" was found.`)
      return inputBuffer
    }

    const quality = parseQuality(request.query.quality ?? request.query.q, format.quality, options.quality)
    const upstreamEtag = reply.getHeader('etag')
    const derivedEtag = typeof upstreamEtag === 'string' && upstreamEtag.length > 0
      ? computeDerivedEtag(upstreamEtag, format.format, quality, params, aiModel)
      : undefined

    if (derivedEtag !== undefined && matchesIfNoneMatch(request.headers['if-none-match'], derivedEtag)) {
      return sendNotModified(reply, derivedEtag)
    }

    return await encodeAndReply(instance, request, reply, {
      format,
      options,
      inputLength,
      quality,
      derivedEtag,
      params,
    }, inFlight)
  }
  catch (err) {
    if (isFatalInputLimitError(err)) {
      throw err
    }
    request.log.error(err)
    return inputBuffer
  }
}
