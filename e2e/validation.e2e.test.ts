import type { Buffer } from 'node:buffer'
import Fastify from 'fastify'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import fastifyModernImages from '../src/index'

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
      '?b=red&b=blue',
      '?w=50&w=100',
      '?r=90&r=180',
      '?f=contain&f=cover',
      '?p=top&p=bottom',
      '?ai=u2net&ai=isnet',
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
