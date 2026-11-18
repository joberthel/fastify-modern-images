import type { FastifyInstance } from 'fastify'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fastifyModernImages from '../src'

describe('plugin options', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = fastify()
    server.register(fastifyModernImages, { quality: 7 })
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('accepts numeric quality option and transforms image', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
  })

  it('does not double-transform when registered multiple times', async () => {
    const multiServer = fastify()
    let transformCount = 0
    multiServer.addHook('onSend', async (_req, reply, payload) => {
      if (reply.getHeader('content-type') === 'image/webp') {
        transformCount++
      }
      return payload
    })
    multiServer.register(fastifyModernImages, { quality: 8 })
    multiServer.register(fastifyModernImages, { quality: 1 })
    multiServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await multiServer.ready()

    const singleServer = fastify()
    singleServer.register(fastifyModernImages, { quality: 8 })
    singleServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await singleServer.ready()

    try {
      const [multiRes, singleRes] = await Promise.all([
        multiServer.inject({
          method: 'GET',
          url: '/test.jpg',
          headers: { accept: 'image/webp' },
        }),
        singleServer.inject({
          method: 'GET',
          url: '/test.jpg',
          headers: { accept: 'image/webp' },
        }),
      ])

      expect(multiRes.statusCode).toBe(200)
      expect(multiRes.headers['content-type']).toBe('image/webp')
      expect(multiRes.rawPayload).toEqual(singleRes.rawPayload)
      expect(transformCount).toBe(0)
    }
    finally {
      await Promise.all([
        multiServer.close(),
        singleServer.close(),
      ])
    }
  })

  it('passes sharpInputOptions to sharp and enforces limitInputPixels', async () => {
    const limitedServer = fastify()
    limitedServer.register(fastifyModernImages, {
      sharpInputOptions: {
        limitInputPixels: 1,
      },
    })
    limitedServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await limitedServer.ready()

    try {
      const res = await limitedServer.inject({
        method: 'GET',
        url: '/test.jpg',
        headers: {
          accept: 'image/webp',
        },
      })

      expect(res.statusCode).toBe(500)
    }
    finally {
      await limitedServer.close()
    }
  })

  it('enforces maxInputBytes for stream and buffer payloads', async () => {
    const limitedServer = fastify()
    limitedServer.register(fastifyModernImages, {
      maxInputBytes: 100,
    })
    limitedServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    limitedServer.get('/buffer.jpg', async (_req, reply) => {
      reply.type('image/jpeg')
      return Buffer.alloc(101)
    })
    await limitedServer.ready()

    try {
      const streamRes = await limitedServer.inject({
        method: 'GET',
        url: '/test.jpg',
        headers: {
          accept: 'image/webp',
        },
      })
      expect(streamRes.statusCode).toBe(500)

      const bufferRes = await limitedServer.inject({
        method: 'GET',
        url: '/buffer.jpg',
        headers: {
          accept: 'image/webp',
        },
      })
      expect(bufferRes.statusCode).toBe(500)
    }
    finally {
      await limitedServer.close()
    }
  })

  it('rejects registration with invalid compression format or quality option', async () => {
    const badCompressionServer = fastify()
    badCompressionServer.register(fastifyModernImages, {
      compression: {
        jpg: { enabled: false },
      },
    })
    await expect(badCompressionServer.ready()).rejects.toThrow(
      'Invalid compression format "jpg". Supported formats are: avif, webp, jpeg, png',
    )
    await badCompressionServer.close()

    const badQualityServer = fastify()
    badQualityServer.register(fastifyModernImages, {
      quality: '10',
    })
    await expect(badQualityServer.ready()).rejects.toThrow(
      'Invalid quality option "10". Expected a quality tier from 1 to 9.',
    )
    await badQualityServer.close()
  })

  it('passes through original payload on maxInputBytes when onLimitExceeded is passthrough', async () => {
    const passthroughServer = fastify()
    passthroughServer.register(fastifyModernImages, {
      maxInputBytes: 100,
      onLimitExceeded: 'passthrough',
    })
    passthroughServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    const rawPayload = Buffer.alloc(101, 0x41)
    passthroughServer.get('/buffer.jpg', async (_req, reply) => {
      reply.type('image/jpeg')
      return rawPayload
    })
    await passthroughServer.ready()

    try {
      const streamRes = await passthroughServer.inject({
        method: 'GET',
        url: '/test.jpg',
        headers: { accept: 'image/webp' },
      })
      expect(streamRes.statusCode).toBe(200)
      expect(streamRes.headers['content-type']).toBe('image/jpeg')

      const bufferRes = await passthroughServer.inject({
        method: 'GET',
        url: '/buffer.jpg',
        headers: { accept: 'image/webp' },
      })
      expect(bufferRes.statusCode).toBe(200)
      expect(bufferRes.rawPayload).toEqual(rawPayload)
    }
    finally {
      await passthroughServer.close()
    }
  })

  it('passes through original payload on limitInputPixels when onLimitExceeded is passthrough', async () => {
    const pixelPassthroughServer = fastify()
    pixelPassthroughServer.register(fastifyModernImages, {
      onLimitExceeded: 'passthrough',
      sharpInputOptions: { limitInputPixels: 1 },
    })
    pixelPassthroughServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await pixelPassthroughServer.ready()

    try {
      const pixelRes = await pixelPassthroughServer.inject({
        method: 'GET',
        url: '/test.jpg',
        headers: { accept: 'image/webp' },
      })
      expect(pixelRes.statusCode).toBe(200)
      expect(pixelRes.headers['content-type']).toBe('image/jpeg')
    }
    finally {
      await pixelPassthroughServer.close()
    }
  })
})
