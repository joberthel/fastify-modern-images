import type sharp from 'sharp'

export interface MinifyQuerystring {
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
  q?: MinifyQuerystring['quality']
  w?: MinifyQuerystring['width']
  h?: MinifyQuerystring['height']
  f?: MinifyQuerystring['fit']
  p?: MinifyQuerystring['position']
  b?: MinifyQuerystring['background']
  r?: MinifyQuerystring['rotation']
  a?: MinifyQuerystring['ai']
  t?: MinifyQuerystring['trim']
}

export interface MinifyRequest {
  Querystring: MinifyQuerystring
}

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
  regex: RegExp
  quality: string | number
  maxDimension: number
  maxInputBytes: number
  withoutEnlargement: boolean
  rembg: RembgOptions
  compression: Record<string, CompressionConfig>
  sharpInputOptions?: sharp.SharpOptions
}

export type FastifyModernImagesOptionsCompression = Partial<CompressionConfig>

export interface FastifyModernImagesOptions {
  regex?: RegExp
  quality?: string | number
  maxDimension?: number
  maxInputBytes?: number
  withoutEnlargement?: boolean
  rembg?: Partial<RembgOptions>
  compression?: Record<string, FastifyModernImagesOptionsCompression>
  sharpInputOptions?: sharp.SharpOptions
}
