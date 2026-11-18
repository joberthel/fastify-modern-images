import type {
  FastifyModernImagesOptions,
  ImageTransformQuerystring,
  ImageTransformRequest,
  MinifyQuerystring,
  MinifyRequest,
  QualityTier,
} from '../src/types'
import { describe, expect, it } from 'vitest'

describe('imageTransformQuerystring types', () => {
  it('allows empty and partial ImageTransformQuerystring objects without required shortcut properties', () => {
    const empty: ImageTransformQuerystring = {}
    const partial: ImageTransformQuerystring = { w: '100' }

    expect(empty).toEqual({})
    expect(partial).toEqual({ w: '100' })
  })

  it('keeps deprecated MinifyQuerystring and MinifyRequest aliases compatible', () => {
    // eslint-disable-next-line ts/no-deprecated
    const query: MinifyQuerystring = { width: '100' }
    // eslint-disable-next-line ts/no-deprecated
    const req: MinifyRequest = { Querystring: query }
    const modernReq: ImageTransformRequest = req

    expect(modernReq.Querystring).toEqual({ width: '100' })
  })

  it('accepts valid QualityTier and ImageFormat compression options', () => {
    const tier: QualityTier = '7'
    const numericTier: QualityTier = 7
    const opts: FastifyModernImagesOptions = {
      quality: tier,
      compression: {
        avif: { enabled: false },
        webp: { enabled: true },
      },
    }

    expect(opts.quality).toBe('7')
    expect(numericTier).toBe(7)
  })
})
