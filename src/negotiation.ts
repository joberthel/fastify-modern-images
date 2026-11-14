import type { Stream } from 'node:stream'
import type { Metadata } from 'sharp'
import type { CompressionConfig } from './types'
import { Buffer } from 'node:buffer'

export function guard(regex: RegExp, path: string = '/'): boolean {
  regex.lastIndex = 0
  return regex.test(path)
}

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
