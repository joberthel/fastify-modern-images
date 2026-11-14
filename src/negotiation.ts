import type { Stream } from 'node:stream'
import type { Metadata } from 'sharp'
import type { CompressionConfig, MinifyQuerystring } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { parseBackground, parseDimension, parseFit, parsePosition, parseRotation, parseTrim } from './validation'

export function isStream(stream: unknown): stream is Stream {
  return stream !== null && typeof stream === 'object' && 'pipe' in stream && typeof stream.pipe === 'function'
}

export function validatePayload(contentType: string | string[] | number = '', validContentTypes: string[], payload: unknown): boolean {
  if (Array.isArray(contentType) || typeof contentType === 'number') {
    return false
  }

  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase()
  const normalizedValidContentTypes = validContentTypes.map(type => type.trim().toLowerCase())

  return normalizedValidContentTypes.includes(normalizedContentType) && (isStream(payload) || Buffer.isBuffer(payload))
}

function parseQValue(params: string[]): number {
  let q = 1
  for (const param of params) {
    const [rawKey, rawVal] = param.split('=')
    if (rawKey?.trim().toLowerCase() === 'q' && rawVal !== undefined) {
      const parsed = Number.parseFloat(rawVal.trim())
      if (!Number.isNaN(parsed)) {
        q = parsed
      }
    }
  }
  return q
}

export function isMediaTypeAccepted(accept: string, mediaType: string): boolean {
  if (!accept) {
    return false
  }

  const target = mediaType.toLowerCase()
  for (const part of accept.split(',')) {
    const [rawType, ...params] = part.split(';')
    if (rawType.trim().toLowerCase() !== target) {
      continue
    }

    if (parseQValue(params) > 0) {
      return true
    }
  }

  return false
}

export function getBestFormat(
  accept: string = '',
  metadata: Metadata,
  formats: CompressionConfig[],
  flattened: boolean = false,
): CompressionConfig | false {
  const hasAlpha = !flattened && metadata.hasAlpha === true
  const sorted = formats
    .filter(item =>
      item.enabled
      && (!hasAlpha || item.alpha)
      && (flattened || !(metadata.format === 'png' && item.format === 'jpeg'))
      && item.supported(accept),
    )
    .sort((a, b) => b.priority - a.priority)

  if (sorted.length > 0) {
    return sorted[0]
  }

  return false
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

export function computeDerivedEtag(
  upstreamEtag: string,
  format: string,
  quality: number | undefined,
  query: MinifyQuerystring,
  aiModel?: string,
  maxDimension?: number,
): string {
  const normalized = {
    upstreamEtag,
    format,
    quality: quality ?? null,
    width: parseDimension(query.width ?? query.w, maxDimension),
    height: parseDimension(query.height ?? query.h, maxDimension),
    fit: parseFit(query.fit ?? query.f) ?? null,
    position: parsePosition(query.position ?? query.p) ?? null,
    background: parseBackground(query.background ?? query.b) ?? null,
    rotation: parseRotation(query.rotation ?? query.r) ?? null,
    trim: parseTrim(query.trim ?? query.t),
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
