import type {
  FastifyModernImagesOptions,
  ImageFormat,
  ResolvedFastifyModernImagesOptions,
} from './types'
import { isMediaTypeAccepted } from './negotiation'
import { MAX_DIMENSION } from './validation'

export const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024

export const defaults: ResolvedFastifyModernImagesOptions = {
  urlPattern: /.*/,
  regex: /.*/,
  quality: '7',
  maxDimension: MAX_DIMENSION,
  maxInputBytes: DEFAULT_MAX_INPUT_BYTES,
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

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function mergeInto(result: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (UNSAFE_KEYS.has(key) || value === undefined) {
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
    if (UNSAFE_KEYS.has(key)) {
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

const VALID_IMAGE_FORMATS = new Set<ImageFormat>(['avif', 'webp', 'jpeg', 'png'])

const VALID_QUALITY_TIERS = new Set<unknown>([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
])

function assertPositiveInteger(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name} option: expected a positive integer`)
  }
}

function assertPositiveFiniteNumber(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name} option: expected a positive finite number`)
  }
}

function assertBoolean(value: unknown, name: string): void {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Invalid ${name} option: expected a boolean`)
  }
}

function assertNonEmptyString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name} option: expected a non-empty string`)
  }
}

function validateCompressionQuality(quality: unknown, format: string): void {
  if (!isPlainObject(quality)) {
    throw new Error(`Invalid compression.${format}.quality option: expected an object`)
  }
  for (const [tier, value] of Object.entries(quality)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 100) {
      throw new Error(`Invalid compression.${format}.quality["${tier}"] option: expected a number between 1 and 100`)
    }
  }
}

function validateCompressionEntry(format: string, config: unknown): void {
  if (!VALID_IMAGE_FORMATS.has(format as ImageFormat)) {
    throw new Error(`Invalid compression format "${format}". Supported formats are: avif, webp, jpeg, png`)
  }
  if (config === undefined) {
    return
  }
  if (!isPlainObject(config)) {
    throw new Error(`Invalid compression.${format} option: expected an object`)
  }
  if (config.format !== undefined && config.format !== format) {
    throw new Error(`Invalid compression.${format}.format option: expected "${format}"`)
  }
  if (config.enabled !== undefined) {
    assertBoolean(config.enabled, `compression.${format}.enabled`)
  }
  if (config.priority !== undefined && (typeof config.priority !== 'number' || !Number.isFinite(config.priority))) {
    throw new Error(`Invalid compression.${format}.priority option: expected a finite number`)
  }
  if (config.alpha !== undefined) {
    assertBoolean(config.alpha, `compression.${format}.alpha`)
  }
  if (config.contentType !== undefined) {
    assertNonEmptyString(config.contentType, `compression.${format}.contentType`)
  }
  if (config.supported !== undefined && typeof config.supported !== 'function') {
    throw new Error(`Invalid compression.${format}.supported option: expected a function`)
  }
  if (config.quality !== undefined) {
    validateCompressionQuality(config.quality, format)
  }
}

function validateCompression(compression: unknown): void {
  if (!isPlainObject(compression)) {
    throw new Error('Invalid compression option: expected an object')
  }
  for (const [format, config] of Object.entries(compression)) {
    validateCompressionEntry(format, config)
  }
}

function validateRembg(rembg: unknown): void {
  if (!isPlainObject(rembg)) {
    throw new Error('Invalid rembg option: expected an object')
  }
  if (rembg.enabled !== undefined) {
    assertBoolean(rembg.enabled, 'rembg.enabled')
  }
  if (rembg.model !== undefined) {
    assertNonEmptyString(rembg.model, 'rembg.model')
  }
  if (rembg.allowedModels !== undefined) {
    if (!Array.isArray(rembg.allowedModels) || rembg.allowedModels.some(m => typeof m !== 'string' || m.length === 0)) {
      throw new Error('Invalid rembg.allowedModels option: expected an array of non-empty strings')
    }
  }
  if (rembg.timeoutMs !== undefined) {
    assertPositiveFiniteNumber(rembg.timeoutMs, 'rembg.timeoutMs')
  }
  if (rembg.concurrency !== undefined) {
    assertPositiveInteger(rembg.concurrency, 'rembg.concurrency')
  }
  if (rembg.endpoint !== undefined) {
    assertNonEmptyString(rembg.endpoint, 'rembg.endpoint')
  }
}

function validateOptions(opts: FastifyModernImagesOptions): void {
  if (!isPlainObject(opts)) {
    throw new Error('Invalid plugin options: expected an object')
  }
  if (opts.urlPattern !== undefined && !(opts.urlPattern instanceof RegExp)) {
    throw new Error('Invalid urlPattern option: expected a RegExp instance')
  }
  if (opts.regex !== undefined && !(opts.regex instanceof RegExp)) {
    throw new Error('Invalid regex option: expected a RegExp instance')
  }
  if (opts.quality !== undefined && !VALID_QUALITY_TIERS.has(opts.quality)) {
    throw new Error(`Invalid quality option "${String(opts.quality)}". Expected a quality tier from 1 to 9.`)
  }
  if (opts.maxDimension !== undefined) {
    assertPositiveInteger(opts.maxDimension, 'maxDimension')
  }
  if (
    opts.allowedDimensions !== undefined
    && (!Array.isArray(opts.allowedDimensions) || opts.allowedDimensions.some(d => typeof d !== 'number' || !Number.isInteger(d) || d <= 0))
  ) {
    throw new Error('Invalid allowedDimensions option: expected an array of positive integers')
  }
  if (opts.maxInputBytes !== undefined) {
    assertPositiveFiniteNumber(opts.maxInputBytes, 'maxInputBytes')
  }
  if (opts.withoutEnlargement !== undefined && typeof opts.withoutEnlargement !== 'boolean') {
    throw new Error('Invalid withoutEnlargement option: expected a boolean')
  }
  if (opts.rembg !== undefined) {
    validateRembg(opts.rembg)
  }
  if (opts.compression !== undefined) {
    validateCompression(opts.compression)
  }
  if (opts.sharpInputOptions !== undefined && !isPlainObject(opts.sharpInputOptions)) {
    throw new Error('Invalid sharpInputOptions option: expected an object')
  }
  if (opts.verifyRequest !== undefined && typeof opts.verifyRequest !== 'function') {
    throw new Error('Invalid verifyRequest option: expected a function')
  }
}

export function resolveOptions(opts: FastifyModernImagesOptions): ResolvedFastifyModernImagesOptions {
  validateOptions(opts)
  const resolved = deepMerge(defaults, opts)
  if (opts.urlPattern !== undefined) {
    resolved.regex = opts.urlPattern
  }
  else if (opts.regex !== undefined) {
    resolved.urlPattern = opts.regex
  }
  return resolved
}
