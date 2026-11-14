import type { ImageTransformQuerystring } from './types'

export const MAX_DIMENSION = 4096

const VALID_FIT_VALUES = new Set<NonNullable<ImageTransformQuerystring['fit']>>([
  'cover',
  'contain',
  'fill',
  'inside',
  'outside',
])

const VALID_POSITION_VALUES = new Set<string>([
  'top',
  'right top',
  'right',
  'right bottom',
  'bottom',
  'left bottom',
  'left',
  'left top',
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'center',
  'centre',
  'entropy',
  'attention',
])

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
// Legacy comma-separated rgb()/rgba() (matching numeric or percentage channels)
// and hsl()/hsla() with optional 0..1 alpha values.
const NUM_RE = String.raw`\d{1,3}(?:\.\d+)?`
const PCT_RE = String.raw`\d{1,3}(?:\.\d+)?%`
const ALPHA_RE = String.raw`(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)`
const FUNC_COLOR_RE = new RegExp(
  `^(?:rgba?\\(\\s*(?:${NUM_RE}\\s*,\\s*${NUM_RE}\\s*,\\s*${NUM_RE}|${PCT_RE}\\s*,\\s*${PCT_RE}\\s*,\\s*${PCT_RE})(?:\\s*,\\s*${ALPHA_RE})?\\s*\\)|hsla?\\(\\s*${NUM_RE}\\s*,\\s*${PCT_RE}\\s*,\\s*${PCT_RE}(?:\\s*,\\s*${ALPHA_RE})?\\s*\\))$`,
  'i',
)

const NAMED_COLORS = new Set<string>([
  'transparent',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'cyan',
  'magenta',
  'gray',
  'grey',
  'silver',
  'maroon',
  'olive',
  'lime',
  'aqua',
  'teal',
  'navy',
  'fuchsia',
  'purple',
  'orange',
  'pink',
  'brown',
])

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parseTrim(value?: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0'
}

export function parseDimension(
  value?: string,
  maxDimension = MAX_DIMENSION,
  allowedDimensions?: number[],
): number | null {
  if (!isNonEmptyString(value) || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > maxDimension) {
    return null
  }
  if (allowedDimensions !== undefined && !allowedDimensions.includes(parsed)) {
    return null
  }
  return parsed
}

export function parseRotation(value?: string): number | undefined {
  if (!isNonEmptyString(value) || !/^-?\d+$/.test(value)) {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < -360 || parsed > 360) {
    return undefined
  }
  return parsed
}

export function parseFit(value?: string): NonNullable<ImageTransformQuerystring['fit']> {
  if (isNonEmptyString(value) && VALID_FIT_VALUES.has(value as NonNullable<ImageTransformQuerystring['fit']>)) {
    return value as NonNullable<ImageTransformQuerystring['fit']>
  }
  return 'cover'
}

export function parsePosition(value?: string): string {
  if (!isNonEmptyString(value)) {
    return 'centre'
  }
  if (VALID_POSITION_VALUES.has(value)) {
    return value
  }
  return 'centre'
}

export function parseBackground(value?: string): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined
  }
  const trimmed = value.trim()
  if (HEX_COLOR_RE.test(trimmed) || FUNC_COLOR_RE.test(trimmed) || NAMED_COLORS.has(trimmed.toLowerCase())) {
    return trimmed
  }
  return undefined
}

export function parseQuality(
  value: unknown,
  qualityMap: Record<string, number>,
  fallback: string | number,
): number | undefined {
  if (isNonEmptyString(value) && Object.hasOwn(qualityMap, value)) {
    return qualityMap[value]
  }
  const fallbackKey = String(fallback)
  if (Object.hasOwn(qualityMap, fallbackKey)) {
    return qualityMap[fallbackKey]
  }
  return undefined
}

export interface NormalizedTransformParams {
  width: number | null
  height: number | null
  fit: NonNullable<ImageTransformQuerystring['fit']>
  position: string
  background: string | undefined
  rotation: number | undefined
  trim: boolean
}

export function normalizeTransformParams(
  query: ImageTransformQuerystring,
  maxDimension?: number,
  allowedDimensions?: number[],
): NormalizedTransformParams {
  return {
    width: parseDimension(query.width ?? query.w, maxDimension, allowedDimensions),
    height: parseDimension(query.height ?? query.h, maxDimension, allowedDimensions),
    fit: parseFit(query.fit ?? query.f),
    position: parsePosition(query.position ?? query.p),
    background: parseBackground(query.background ?? query.b),
    rotation: parseRotation(query.rotation ?? query.r),
    trim: parseTrim(query.trim ?? query.t),
  }
}

export function matchesUrlPattern(pattern: RegExp, urlPath: string = '/'): boolean {
  pattern.lastIndex = 0
  return pattern.test(urlPath)
}

/** Backwards-compatible alias for `matchesUrlPattern`. */
export const guard = matchesUrlPattern
