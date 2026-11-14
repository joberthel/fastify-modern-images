import type { ImageTransformQuerystring, ImageTransformRequest, MinifyQuerystring, MinifyRequest } from '../src/types'
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
})
