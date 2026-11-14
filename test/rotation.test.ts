import type { Buffer } from 'node:buffer'
import fastify from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fastifyModernImages from '../src'

describe('rotation and EXIF auto-orientation', () => {
  const server = fastify()
  let landscapeJpeg: Buffer
  let exifRotatedJpeg: Buffer

  beforeAll(async () => {
    landscapeJpeg = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()

    exifRotatedJpeg = await sharp(landscapeJpeg)
      .withMetadata({ orientation: 6 })
      .toBuffer()

    await server.register(fastifyModernImages)
    server.get('/landscape.jpg', (_request, reply) => {
      reply.type('image/jpeg').send(landscapeJpeg)
    })
    server.get('/exif-rotated.jpg', (_request, reply) => {
      reply.type('image/jpeg').send(exifRotatedJpeg)
    })
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('auto-orients an image with an EXIF orientation tag when no rotation is specified', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/exif-rotated.jpg',
    })

    expect(response.statusCode).toBe(200)
    const metadata = await sharp(response.rawPayload).metadata()
    expect(metadata.width).toBe(20)
    expect(metadata.height).toBe(40)
    expect(metadata.orientation).toBeUndefined()
  })

  it('rotates an image when ?rotation=90 is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/landscape.jpg?rotation=90',
    })

    expect(response.statusCode).toBe(200)
    const metadata = await sharp(response.rawPayload).metadata()
    expect(metadata.width).toBe(20)
    expect(metadata.height).toBe(40)
  })

  it('rotates an image when ?r=90 is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/landscape.jpg?r=90',
    })

    expect(response.statusCode).toBe(200)
    const metadata = await sharp(response.rawPayload).metadata()
    expect(metadata.width).toBe(20)
    expect(metadata.height).toBe(40)
  })
})
