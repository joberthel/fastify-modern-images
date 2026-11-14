import type { FastifyModernImagesOptions, ResolvedFastifyModernImagesOptions } from './types'
import { isMediaTypeAccepted } from './negotiation'
import { MAX_DIMENSION } from './validation'

export const defaults: ResolvedFastifyModernImagesOptions = {
  regex: /.*/,
  quality: '7',
  maxDimension: MAX_DIMENSION,
  withoutEnlargement: true,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function mergeInto(result: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || value === undefined) {
      continue
    }

    const existing = result[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(existing, value)
    }
    else if (isPlainObject(value)) {
      result[key] = deepMerge(value)
    }
    else {
      result[key] = value
    }
  }
}

export function deepMerge<T extends object>(
  target: T,
  ...sources: Array<object | undefined>
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    if (key === '__proto__') {
      continue
    }
    result[key] = isPlainObject(value)
      ? deepMerge(value)
      : value
  }

  for (const source of sources) {
    if (source) {
      mergeInto(result, source as Record<string, unknown>)
    }
  }

  return result as T
}

export function resolveOptions(opts: FastifyModernImagesOptions): ResolvedFastifyModernImagesOptions {
  return deepMerge(defaults, opts)
}
