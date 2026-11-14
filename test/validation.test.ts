import type { Buffer } from 'node:buffer'
import Fastify from 'fastify'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import fastifyModernImages from '../src/index'
import {
  MAX_DIMENSION,
  parseBackground,
  parseDimension,
  parseFit,
  parsePosition,
  parseRotation,
} from '../src/validation'

async function createTestImage(width = 100, height = 80): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
}

describe('validation helpers', () => {
  describe('parseDimension', () => {
    it('accepts positive integers within bounds', () => {
      expect(parseDimension('1')).toBe(1)
      expect(parseDimension('200')).toBe(200)
      expect(parseDimension(String(MAX_DIMENSION))).toBe(MAX_DIMENSION)
    })

    it('rejects zero, negative, oversized, and non-numeric values', () => {
      expect(parseDimension(undefined)).toBeNull()
      expect(parseDimension('')).toBeNull()
      expect(parseDimension('0')).toBeNull()
      expect(parseDimension('-10')).toBeNull()
      expect(parseDimension('999999999')).toBeNull()
      expect(parseDimension(String(MAX_DIMENSION + 1))).toBeNull()
      expect(parseDimension('abc')).toBeNull()
    })
  })

  describe('parseRotation', () => {
    it('accepts finite integers', () => {
      expect(parseRotation('0')).toBe(0)
      expect(parseRotation('90')).toBe(90)
      expect(parseRotation('-90')).toBe(-90)
    })

    it('rejects non-numeric, empty, and non-finite values', () => {
      expect(parseRotation(undefined)).toBeUndefined()
      expect(parseRotation('')).toBeUndefined()
      expect(parseRotation('abc')).toBeUndefined()
      expect(parseRotation('Infinity')).toBeUndefined()
    })
  })

  describe('parseFit', () => {
    it('accepts valid fit values and defaults invalid ones to cover', () => {
      expect(parseFit('contain')).toBe('contain')
      expect(parseFit('inside')).toBe('inside')
      expect(parseFit('invalid')).toBe('cover')
      expect(parseFit(undefined)).toBe('cover')
    })
  })

  describe('parsePosition', () => {
    it('accepts valid positions, maps orth to north, and defaults invalid ones to centre', () => {
      expect(parsePosition('top')).toBe('top')
      expect(parsePosition('north')).toBe('north')
      expect(parsePosition('orth')).toBe('north')
      expect(parsePosition('entropy')).toBe('entropy')
      expect(parsePosition('invalid')).toBe('centre')
      expect(parsePosition(undefined)).toBe('centre')
    })
  })

  describe('parseBackground', () => {
    it('accepts valid hex, functional, and named colors', () => {
      expect(parseBackground('#fff')).toBe('#fff')
      expect(parseBackground('#ff00aa')).toBe('#ff00aa')
      expect(parseBackground('rgb(255, 0, 128)')).toBe('rgb(255, 0, 128)')
      expect(parseBackground('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
      expect(parseBackground('red')).toBe('red')
      expect(parseBackground('transparent')).toBe('transparent')
    })

    it('rejects invalid color strings', () => {
      expect(parseBackground(undefined)).toBeUndefined()
      expect(parseBackground('')).toBeUndefined()
      expect(parseBackground('notacolor')).toBeUndefined()
      expect(parseBackground('#zzzzzz')).toBeUndefined()
    })
  })
})

describe('query parameter validation integration', () => {
  it('returns 200 for invalid query parameters instead of 500', async () => {
    const app = Fastify()
    await app.register(fastifyModernImages)
    const image = await createTestImage()

    app.get('/image.png', async (_req, reply) => {
      reply.type('image/png')
      return image
    })

    const invalidQueries = [
      '?rotation=abc',
      '?r=Infinity',
      '?width=-10',
      '?height=0',
      '?width=999999999',
      '?w=abc&h=-5',
      '?width=50&fit=invalid',
      '?width=50&position=invalid',
      '?background=notacolor',
      '?b=invalid!!!',
    ]

    for (const qs of invalidQueries) {
      const res = await app.inject({
        method: 'GET',
        url: `/image.png${qs}`,
        headers: { accept: 'image/png' },
      })
      expect(res.statusCode, `Expected 200 for ${qs}`).toBe(200)
      const meta = await sharp(res.rawPayload).metadata()
      expect(meta.width).toBeGreaterThan(0)
    }

    await app.close()
  })

  it('applies valid query parameters and shortcuts properly', async () => {
    const app = Fastify()
    await app.register(fastifyModernImages)
    const image = await createTestImage(100, 80)

    app.get('/image.png', async (_req, reply) => {
      reply.type('image/png')
      return image
    })

    const res = await app.inject({
      method: 'GET',
      url: '/image.png?w=40&h=40&f=contain&p=north&b=%23ffffff&r=90',
      headers: { accept: 'image/png' },
    })

    expect(res.statusCode).toBe(200)
    const meta = await sharp(res.rawPayload).metadata()
    expect(meta.width).toBe(40)
    expect(meta.height).toBe(40)

    await app.close()
  })
})
