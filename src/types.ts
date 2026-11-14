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
  q: MinifyQuerystring['quality']
  w: MinifyQuerystring['width']
  h: MinifyQuerystring['height']
  f: MinifyQuerystring['fit']
  p: MinifyQuerystring['position']
  b: MinifyQuerystring['background']
  r: MinifyQuerystring['rotation']
  a: MinifyQuerystring['ai']
  t: MinifyQuerystring['trim']
}

export interface MinifyRequest {
  Querystring: MinifyQuerystring
}

export type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'png'

export interface FastifyModernImagesOptions {
  regex?: RegExp
  quality?: string
  rembg?: {
    model?: string
  }
  compression?: Record<string, FastifyModernImagesOptionsCompression>
}

export interface FastifyModernImagesOptionsCompression {
  enabled?: boolean
  format?: ImageFormat
  priority?: number
  alpha?: boolean
  quality?: Record<string, number>
  options?: Record<string, any>
  contentType?: string
  supported?: (accept: string) => boolean
}
