import type { FastifyRequest } from 'fastify'
import type sharp from 'sharp'

/** Query parameters supported for on-the-fly image transformations. */
export interface ImageTransformQuerystring {
  /** Output quality level from `'1'` (worst) to `'9'` (best). */
  quality?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  /** Target width in pixels. */
  width?: string
  /** Target height in pixels. */
  height?: string
  /** How the image should be resized to fit both provided dimensions. */
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  /** Position, gravity, or strategy to use when `fit` is `'cover'` or `'contain'`. */
  position?:
    | 'top'
    | 'right top'
    | 'right'
    | 'right bottom'
    | 'bottom'
    | 'left bottom'
    | 'left'
    | 'left top'
    | 'north'
    | 'northeast'
    | 'east'
    | 'southeast'
    | 'south'
    | 'southwest'
    | 'west'
    | 'northwest'
    | 'center'
    | 'centre'
    | 'entropy'
    | 'attention'
  /**
   * Background colour used when `fit` is `'contain'` or when rotating, and to
   * flatten the image when the colour is opaque (non-transparent).
   */
  background?: string
  /** Rotation angle in degrees. */
  rotation?: string
  /** Enable AI background removal (via `rembg`) when truthy. */
  ai?: string
  /** Trim "boring" pixels from all edges; optionally specify a threshold. */
  trim?: string
  /** Shorthand alias for `quality`. */
  q?: ImageTransformQuerystring['quality']
  /** Shorthand alias for `width`. */
  w?: ImageTransformQuerystring['width']
  /** Shorthand alias for `height`. */
  h?: ImageTransformQuerystring['height']
  /** Shorthand alias for `fit`. */
  f?: ImageTransformQuerystring['fit']
  /** Shorthand alias for `position`. */
  p?: ImageTransformQuerystring['position']
  /** Shorthand alias for `background`. */
  b?: ImageTransformQuerystring['background']
  /** Shorthand alias for `rotation`. */
  r?: ImageTransformQuerystring['rotation']
  /** Shorthand alias for `ai`. */
  a?: ImageTransformQuerystring['ai']
  /** Shorthand alias for `trim`. */
  t?: ImageTransformQuerystring['trim']
}

/** Fastify request generic interface for image transformation routes. */
export interface ImageTransformRequest {
  /** Parsed querystring parameters for image transformation. */
  Querystring: ImageTransformQuerystring
}

/** @deprecated Use ImageTransformQuerystring instead. */
export type MinifyQuerystring = ImageTransformQuerystring

/** @deprecated Use ImageTransformRequest instead. */
export type MinifyRequest = ImageTransformRequest

/** Supported output image formats. */
export type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'png'

/** Valid quality tier values from `'1'` (worst) to `'9'` (best). */
export type QualityTier = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Configuration for a single output image format. */
export interface CompressionConfig {
  /** Whether this output format is enabled. */
  enabled: boolean
  /** Output image format identifier. */
  format: ImageFormat
  /** Format selection priority; higher numbers are preferred (default order: avif -> webp -> jpeg -> png). */
  priority: number
  /** Whether the format supports images with an alpha channel. */
  alpha: boolean
  /** Maps overall quality levels (`'1'`–`'9'`) to format-specific quality values. */
  quality: Record<string, number>
  /** Format-specific options passed directly to `sharp`. */
  options: sharp.AvifOptions | sharp.WebpOptions | sharp.JpegOptions | sharp.PngOptions
  /** `Content-Type` header value served for this image format. */
  contentType: string
  /** Predicate checking whether the client's `Accept` header supports this format. */
  supported: (accept: string) => boolean
}

/** Configuration for AI background removal using `rembg`. */
export interface RembgOptions {
  /** Whether `rembg` background removal is enabled. */
  enabled: boolean
  /**
   * `rembg` model name to use.
   * @see https://github.com/danielgatis/rembg#models
   * @default 'isnet-general-use'
   */
  model: string
  /** Optional allowlist of permitted `rembg` model names. */
  allowedModels?: string[]
  /** Timeout in milliseconds for `rembg` execution. */
  timeoutMs?: number
  /** Maximum number of concurrent `rembg` processes. */
  concurrency?: number
  /** Optional HTTP endpoint for a remote `rembg` service. */
  endpoint?: string
}

export interface ResolvedFastifyModernImagesOptions {
  urlPattern: RegExp
  /** Backwards-compatible alias for `urlPattern`. */
  regex: RegExp
  quality: QualityTier
  maxDimension: number
  allowedDimensions?: number[]
  maxInputBytes: number
  onLimitExceeded: 'passthrough' | 'error'
  withoutEnlargement: boolean
  rembg: RembgOptions
  compression: Record<ImageFormat, CompressionConfig>
  sharpInputOptions?: sharp.SharpOptions
  verifyRequest?: (request: FastifyRequest<ImageTransformRequest>) => boolean | Promise<boolean>
}

export type FastifyModernImagesOptionsCompression = Partial<CompressionConfig>

/** Options for the `fastify-modern-images` plugin. */
export interface FastifyModernImagesOptions {
  /**
   * Regular expression matched against `request.raw.url` (path + query string).
   * The plugin only processes requests that match.
   * @default /.*\/
   */
  urlPattern?: RegExp
  /**
   * Backwards-compatible alias for `urlPattern`.
   * @default /.*\/
   */
  regex?: RegExp
  /**
   * Default quality level from `'1'` (worst) to `'9'` (best).
   * @default '7'
   */
  quality?: QualityTier
  /**
   * Maximum allowed width/height in pixels for resize query parameters.
   * @default 4096
   */
  maxDimension?: number
  /**
   * Optional allowlist of permitted width/height values (e.g. `[320, 640, 1280]`).
   * @default undefined
   */
  allowedDimensions?: number[]
  /**
   * Maximum allowed input/output byte size when buffering streams or payloads.
   * @default 50 * 1024 * 1024
   */
  maxInputBytes?: number
  /**
   * Behavior when an input payload exceeds `maxInputBytes` or `sharpInputOptions.limitInputPixels`.
   * - `'error'`: Abort processing and throw an `InputLimitExceededError` (HTTP `500`).
   * - `'passthrough'`: Log a warning and serve the original payload unmodified when possible.
   * @default 'error'
   */
  onLimitExceeded?: 'passthrough' | 'error'
  /**
   * Do not enlarge if the image width or height is already less than the specified dimensions.
   * @default true
   */
  withoutEnlargement?: boolean
  /** AI background removal (`rembg`) configuration. */
  rembg?: Partial<RembgOptions>
  /** Per-format compression configuration overrides keyed by format name. */
  compression?: Partial<Record<ImageFormat, FastifyModernImagesOptionsCompression>>
  /**
   * Options passed to the `sharp(buffer, options)` constructor (e.g. `limitInputPixels`, `failOn`, `sequentialRead`).
   * @default {}
   */
  sharpInputOptions?: sharp.SharpOptions
  /**
   * Optional callback to validate requests before any image processing runs.
   * Returning `false` skips all transformations and serves the original payload unmodified.
   * @default undefined
   */
  verifyRequest?: (request: FastifyRequest<ImageTransformRequest>) => boolean | Promise<boolean>
}
