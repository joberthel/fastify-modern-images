import type { Stream } from 'node:stream'
import type { Metadata } from 'sharp'
import type { CompressionConfig, ImageTransformQuerystring } from './types'
import type { NormalizedTransformParams } from './validation'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { normalizeTransformParams } from './validation'

export function isStream(stream: unknown): stream is Stream {
  return stream !== null && typeof stream === 'object' && 'pipe' in stream && typeof stream.pipe === 'function'
}

export function validatePayload(contentType: string | string[] | number = '', validContentTypes: ReadonlySet<string> | string[], payload: unknown): boolean {
  if (Array.isArray(contentType) || typeof contentType === 'number') {
    return false
  }

  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase()
  const isValidContentType = Array.isArray(validContentTypes)
    ? validContentTypes.some(type => type.trim().toLowerCase() === normalizedContentType)
    : validContentTypes.has(normalizedContentType)

  return isValidContentType && (isStream(payload) || Buffer.isBuffer(payload))
}

function parseQValue(params: string[]): number {
  let q = 1
  for (const param of params) {
    const [rawKey, rawVal] = param.split('=')
    if (rawKey?.trim().toLowerCase() === 'q' && rawVal !== undefined) {
      const parsed = Number.parseFloat(rawVal.trim())
      if (!Number.isNaN(parsed)) {
        q = Math.min(1, Math.max(0, parsed))
      }
    }
  }
  return q
}

export function getMediaTypeQuality(acceptHeader: string | undefined, targetMime: string): number {
  if (acceptHeader === undefined || acceptHeader === '') {
    return 0
  }

  const target = targetMime.trim().toLowerCase()
  const [targetType] = target.split('/')
  const typeWildcard = targetType
    ? `${targetType}/*`
    : ''

  let exactQ: number | undefined
  let typeWildcardQ: number | undefined
  let allWildcardQ: number | undefined

  for (const part of acceptHeader.split(',')) {
    const [rawType, ...params] = part.split(';')
    const mediaRange = rawType.trim().toLowerCase()
    const q = parseQValue(params)

    if (mediaRange === target) {
      exactQ = exactQ === undefined
        ? q
        : Math.max(exactQ, q)
    }
    else if (typeWildcard && mediaRange === typeWildcard) {
      typeWildcardQ = typeWildcardQ === undefined
        ? q
        : Math.max(typeWildcardQ, q)
    }
    else if (mediaRange === '*/*') {
      allWildcardQ = allWildcardQ === undefined
        ? q
        : Math.max(allWildcardQ, q)
    }
  }

  if (exactQ !== undefined) {
    return exactQ
  }
  if (typeWildcardQ !== undefined) {
    return typeWildcardQ
  }
  if (allWildcardQ !== undefined) {
    return allWildcardQ
  }
  return 0
}

export function isMediaTypeAccepted(accept: string, mediaType: string): boolean {
  return getMediaTypeQuality(accept, mediaType) > 0
}

function isMediaTypeExplicitlyAccepted(acceptHeader: string, targetMime: string): boolean {
  if (!acceptHeader) {
    return false
  }
  const target = targetMime.trim().toLowerCase()
  let exactQ: number | undefined
  for (const part of acceptHeader.split(',')) {
    const [rawType, ...params] = part.split(';')
    if (rawType.trim().toLowerCase() === target) {
      const q = parseQValue(params)
      exactQ = exactQ === undefined
        ? q
        : Math.max(exactQ, q)
    }
  }
  return exactQ !== undefined && exactQ > 0
}

export function getBestFormat(
  accept: string = '',
  metadata: Metadata,
  formats: CompressionConfig[],
  flattened: boolean = false,
): CompressionConfig | undefined {
  const hasAlpha = !flattened && metadata.hasAlpha === true
  const allowsJpegForPng = flattened || isMediaTypeExplicitlyAccepted(accept, 'image/jpeg')
  const allowsPngForJpeg = !formats.some(
    item =>
      item.enabled
      && item.format !== 'png'
      && (!hasAlpha || item.alpha)
      && item.supported(accept)
      && isMediaTypeAccepted(accept, item.contentType),
  )
  // Prevent opaque PNGs from converting to lossy JPEG by default when modern
  // formats (avif/webp) are not accepted, unless the caller flattened the image
  // or the client explicitly accepts image/jpeg.
  // Similarly, prevent JPEG sources from converting to PNG (which inflates file
  // size) unless no other enabled, supported, and accepted format is available.
  const sorted = formats
    .filter(item =>
      item.enabled
      && (!hasAlpha || item.alpha)
      && (allowsJpegForPng || !(metadata.format === 'png' && item.format === 'jpeg'))
      && (allowsPngForJpeg || !(metadata.format === 'jpeg' && item.format === 'png'))
      && item.supported(accept),
    )
    .sort((a, b) => {
      const qDiff = getMediaTypeQuality(accept, b.contentType) - getMediaTypeQuality(accept, a.contentType)
      if (qDiff !== 0) {
        return qDiff
      }
      return b.priority - a.priority
    })

  return sorted[0]
}

export function appendVaryHeader(
  existing: number | string | string[] | undefined,
  value: string,
): string {
  const rawValues = existing === undefined
    ? []
    : Array.isArray(existing)
      ? existing
      : [
          String(existing),
        ]

  const parts = rawValues
    .flatMap(item => item.split(','))
    .map(item => item.trim())
    .filter(item => item.length > 0)

  const target = value.toLowerCase()
  if (!parts.some(item => item.toLowerCase() === target)) {
    parts.push(value)
  }

  return parts.join(', ')
}

function isNormalizedTransformParams(
  value: ImageTransformQuerystring | NormalizedTransformParams,
): value is NormalizedTransformParams {
  return typeof value.trim === 'boolean' && (value.width === null || typeof value.width === 'number')
}

export function computeDerivedEtag(
  upstreamEtag: string,
  format: string,
  quality: number | undefined,
  queryOrParams: ImageTransformQuerystring | NormalizedTransformParams,
  aiModel?: string,
  maxDimension?: number,
  allowedDimensions?: number[],
): string {
  const params = isNormalizedTransformParams(queryOrParams)
    ? queryOrParams
    : normalizeTransformParams(queryOrParams, maxDimension, allowedDimensions)
  const normalized = {
    upstreamEtag,
    format,
    quality: quality ?? null,
    width: params.width,
    height: params.height,
    fit: params.fit ?? null,
    position: params.position ?? null,
    background: params.background ?? null,
    rotation: params.rotation ?? null,
    trim: params.trim,
    ai: aiModel ?? null,
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('base64url')
    .slice(0, 16)
  return `W/"${digest}"`
}

function stripWeakPrefix(etag: string): string {
  const trimmed = etag.trim()
  return trimmed.startsWith('W/')
    ? trimmed.slice(2)
    : trimmed
}

export function matchesIfNoneMatch(
  ifNoneMatch: string | string[] | undefined,
  etag: string,
): boolean {
  if (ifNoneMatch === undefined) {
    return false
  }

  const raw = Array.isArray(ifNoneMatch)
    ? ifNoneMatch.join(',')
    : ifNoneMatch
  const target = stripWeakPrefix(etag)

  for (const candidate of raw.split(',')) {
    const trimmed = candidate.trim()
    if (trimmed === '*' || stripWeakPrefix(trimmed) === target) {
      return true
    }
  }

  return false
}
