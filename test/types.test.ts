import type { FastifyRequest } from 'fastify'
import type {
  CompressionConfig,
  FastifyModernImagesOptions,
  FastifyModernImagesOptionsCompression,
  ImageFormat,
  ImageTransformQuerystring,
  ImageTransformRequest,
  MinifyQuerystring,
  MinifyRequest,
  QualityTier,
  RembgOptions,
  ResolvedFastifyModernImagesOptions,
} from '../src/index'
import { describe, expect, it } from 'vitest'
import fastifyModernImages, { InputLimitExceededError } from '../src/index'

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

describe('public entrypoint exports', () => {
  it('re-exports public TypeScript types from package entrypoint', () => {
    const format: ImageFormat = 'webp'
    const compression: FastifyModernImagesOptionsCompression = { enabled: true, format }
    const rembg: Partial<RembgOptions> = { enabled: false }
    const options: FastifyModernImagesOptions = {
      compression: { webp: compression },
      rembg,
      verifyRequest: (request: FastifyRequest<ImageTransformRequest>) => request.query.w !== 'blocked',
    }

    const fullCompression: CompressionConfig = {
      enabled: true,
      format: 'webp',
      priority: 2,
      alpha: true,
      quality: { 7: 80 },
      options: {},
      contentType: 'image/webp',
      supported: accept => accept.includes('image/webp'),
    }

    const resolvedCheck: Partial<ResolvedFastifyModernImagesOptions> = {
      maxDimension: 4096,
    }

    expect(typeof fastifyModernImages).toBe('function')
    expect(options.compression?.webp?.format).toBe('webp')
    expect(fullCompression.contentType).toBe('image/webp')
    expect(resolvedCheck.maxDimension).toBe(4096)
  })

  it('exports InputLimitExceededError as both a runtime class and a type', () => {
    const error: InputLimitExceededError = new InputLimitExceededError('exceeds limit')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(InputLimitExceededError)
    expect(error.name).toBe('InputLimitExceededError')
    expect(error.message).toBe('exceeds limit')
  })
})
