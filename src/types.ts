import type { FastifyRequest } from 'fastify'
import type sharp from 'sharp'

export interface ImageTransformQuerystring {
  quality?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  width?: string
  height?: string
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
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
  background?: string
  rotation?: string
  ai?: string
  trim?: string
  /** Shortcuts */
  q?: ImageTransformQuerystring['quality']
  w?: ImageTransformQuerystring['width']
  h?: ImageTransformQuerystring['height']
  f?: ImageTransformQuerystring['fit']
  p?: ImageTransformQuerystring['position']
  b?: ImageTransformQuerystring['background']
  r?: ImageTransformQuerystring['rotation']
  a?: ImageTransformQuerystring['ai']
  t?: ImageTransformQuerystring['trim']
}

export interface ImageTransformRequest {
  Querystring: ImageTransformQuerystring
}

/** @deprecated Use ImageTransformQuerystring instead. */
export type MinifyQuerystring = ImageTransformQuerystring

/** @deprecated Use ImageTransformRequest instead. */
export type MinifyRequest = ImageTransformRequest

export type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'png'

export interface CompressionConfig {
  enabled: boolean
  format: ImageFormat
  priority: number
  alpha: boolean
  quality: Record<string, number>
  options: sharp.AvifOptions | sharp.WebpOptions | sharp.JpegOptions | sharp.PngOptions
  contentType: string
  supported: (accept: string) => boolean
}

export interface RembgOptions {
  enabled: boolean
  model: string
  allowedModels?: string[]
  timeoutMs?: number
  concurrency?: number
  endpoint?: string
}

export interface ResolvedFastifyModernImagesOptions {
  urlPattern: RegExp
  /** Backwards-compatible alias for `urlPattern`. */
  regex: RegExp
  quality: string | number
  maxDimension: number
  allowedDimensions?: number[]
  maxInputBytes: number
  withoutEnlargement: boolean
  rembg: RembgOptions
  compression: Record<string, CompressionConfig>
  sharpInputOptions?: sharp.SharpOptions
  verifyRequest?: (request: FastifyRequest<ImageTransformRequest>) => boolean | Promise<boolean>
}

export type FastifyModernImagesOptionsCompression = Partial<CompressionConfig>

export interface FastifyModernImagesOptions {
  urlPattern?: RegExp
  /** Backwards-compatible alias for `urlPattern`. */
  regex?: RegExp
  quality?: string | number
  maxDimension?: number
  allowedDimensions?: number[]
  maxInputBytes?: number
  withoutEnlargement?: boolean
  rembg?: Partial<RembgOptions>
  compression?: Record<string, FastifyModernImagesOptionsCompression>
  sharpInputOptions?: sharp.SharpOptions
  verifyRequest?: (request: FastifyRequest<ImageTransformRequest>) => boolean | Promise<boolean>
}
