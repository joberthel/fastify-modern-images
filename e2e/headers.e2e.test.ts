import type { FastifyInstance } from 'fastify'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fastifyModernImages from '../src'

describe('response headers', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = fastify()
    server.register(fastifyModernImages)
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('sets a weak derived ETag header on transformed WebP response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers.etag).toMatch(/^W\/"[\w-]+"$/)
    expect(res.headers['accept-ranges']).toBeUndefined()
  })

  it('sets a weak derived ETag header on transformed AVIF response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg?width=150',
      headers: {
        accept: 'image/avif',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/avif')
    expect(res.headers.etag).toMatch(/^W\/"[\w-]+"$/)
  })

  it('returns 304 Not Modified when If-None-Match matches derived ETag', async () => {
    const first = await server.inject({
      method: 'GET',
      url: '/test.jpg?width=100',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(first.statusCode).toBe(200)
    const etag = first.headers.etag as string
    expect(etag).toMatch(/^W\/"[\w-]+"$/)

    const second = await server.inject({
      method: 'GET',
      url: '/test.jpg?width=100',
      headers: {
        'accept': 'image/webp',
        'if-none-match': etag,
      },
    })

    expect(second.statusCode).toBe(304)
    expect(second.headers.etag).toBe(etag)
    expect(second.headers.vary).toContain('Accept')
    expect(second.rawPayload.length).toBe(0)
  })

  it('coalesces concurrent identical requests', async () => {
    const [res1, res2] = await Promise.all([
      server.inject({
        method: 'GET',
        url: '/test.jpg?width=120',
        headers: { accept: 'image/webp' },
      }),
      server.inject({
        method: 'GET',
        url: '/test.jpg?width=120',
        headers: { accept: 'image/webp' },
      }),
    ])

    expect(res1.statusCode).toBe(200)
    expect(res2.statusCode).toBe(200)
    expect(res1.headers['content-type']).toBe('image/webp')
    expect(res2.headers['content-type']).toBe('image/webp')
    expect(res1.rawPayload).toEqual(res2.rawPayload)
  })

  it('preserves ETag header on passthrough response', async () => {
    const passthroughServer = fastify()
    passthroughServer.register(fastifyModernImages, { regex: /^\/other\// })
    passthroughServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await passthroughServer.ready()

    const res = await passthroughServer.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/webp' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers.etag).toBeDefined()
    await passthroughServer.close()
  })

  it('skips 206 Partial Content byte-range responses', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
        range: 'bytes=0-1023',
      },
    })

    expect(res.statusCode).toBe(206)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['content-range']).toMatch(/^bytes 0-1023\//)
    expect(res.rawPayload.length).toBe(1024)
  })

  it('aligns HEAD response headers with GET for negotiated images', async () => {
    const getRes = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    const headRes = await server.inject({
      method: 'HEAD',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(headRes.statusCode).toBe(200)
    expect(headRes.rawPayload.length).toBe(0)
    expect(headRes.headers['content-type']).toBe(getRes.headers['content-type'])
    expect(headRes.headers['content-type']).toBe('image/webp')
    expect(headRes.headers['content-length']).toBe(getRes.headers['content-length'])
    expect(headRes.headers.etag).toBe(getRes.headers.etag)
    expect(headRes.headers.vary).toBe(getRes.headers.vary)
    expect(headRes.headers['accept-ranges']).toBeUndefined()
  })

  it('returns 304 for HEAD when If-None-Match matches derived ETag', async () => {
    const headRes = await server.inject({
      method: 'HEAD',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    const res304 = await server.inject({
      method: 'HEAD',
      url: '/test.jpg',
      headers: {
        'accept': 'image/webp',
        'if-none-match': headRes.headers.etag as string,
      },
    })

    expect(res304.statusCode).toBe(304)
    expect(res304.rawPayload.length).toBe(0)
    expect(res304.headers.etag).toBe(headRes.headers.etag)
    expect(res304.headers.vary).toBe('Accept')
  })

  it('aligns HEAD response headers with GET on custom Fastify GET routes', async () => {
    const customServer = fastify()
    customServer.register(fastifyModernImages)
    customServer.get('/custom.jpg', async (_request, reply) => {
      const { readFile } = await import('node:fs/promises')
      reply.type('image/jpeg')
      return readFile(path.join(__dirname, '../example/public/test.jpg'))
    })
    await customServer.ready()

    const getRes = await customServer.inject({
      method: 'GET',
      url: '/custom.jpg',
      headers: { accept: 'image/webp' },
    })
    const headRes = await customServer.inject({
      method: 'HEAD',
      url: '/custom.jpg',
      headers: { accept: 'image/webp' },
    })

    expect(headRes.statusCode).toBe(200)
    expect(headRes.rawPayload.length).toBe(0)
    expect(headRes.headers['content-type']).toBe('image/webp')
    expect(headRes.headers['content-length']).toBe(getRes.headers['content-length'])
    expect(headRes.headers.vary).toBe('Accept')

    await customServer.close()
  })

  it('skips non-GET/HEAD requests', async () => {
    const postServer = fastify()
    postServer.register(fastifyModernImages)
    postServer.post('/upload.jpg', async (_request, reply) => {
      reply.type('image/jpeg')
      return Buffer.from('raw-image')
    })
    await postServer.ready()

    const res = await postServer.inject({
      method: 'POST',
      url: '/upload.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    await postServer.close()
  })

  it('sets Vary: Accept on early no-format fallback responses', async () => {
    const noFallbackServer = fastify()
    noFallbackServer.register(fastifyModernImages, {
      compression: {
        jpeg: { enabled: false },
        png: { enabled: false },
      },
    })
    noFallbackServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await noFallbackServer.ready()

    const res = await noFallbackServer.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/gif',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers.vary).toBe('Accept')

    await noFallbackServer.close()
  })

  it('sets Vary: Accept on post-metadata no-format fallback responses', async () => {
    const noModernServer = fastify()
    noModernServer.register(fastifyModernImages, {
      compression: {
        avif: { enabled: false },
        webp: { enabled: false },
        jpeg: { enabled: true },
        png: { enabled: false },
      },
    })
    noModernServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await noModernServer.ready()

    const res = await noModernServer.inject({
      method: 'GET',
      url: '/test-alpha.png',
      headers: {
        accept: 'image/jpeg',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers.vary).toBe('Accept')

    await noModernServer.close()
  })

  it('sets Vary: Accept on animated image bypass responses', async () => {
    const frame1 = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer()
    const frame2 = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    }).png().toBuffer()
    const animatedWebp = await sharp([frame1, frame2], {
      join: { animated: true },
    }).webp().toBuffer()

    const animatedServer = fastify()
    animatedServer.register(fastifyModernImages)
    animatedServer.get('/animated.webp', (_request, reply) => {
      reply.header('Vary', 'Origin')
      return reply.type('image/webp').send(animatedWebp)
    })
    await animatedServer.ready()

    const res = await animatedServer.inject({
      method: 'GET',
      url: '/animated.webp',
      headers: {
        accept: 'image/avif,image/webp,*/*',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers.vary).toBe('Origin, Accept')
    expect(res.rawPayload).toEqual(animatedWebp)

    await animatedServer.close()
  })

  it('sets Vary: Accept and Cache-Control: no-store on error fallback responses', async () => {
    const corruptPayload = Buffer.from('not-a-valid-jpeg')
    const errorServer = fastify()
    errorServer.register(fastifyModernImages)
    errorServer.get('/corrupt.jpg', (_request, reply) => {
      reply.header('Cache-Control', 'public, max-age=31536000')
      reply.header('Vary', 'Origin')
      return reply.type('image/jpeg').send(corruptPayload)
    })
    await errorServer.ready()

    const res = await errorServer.inject({
      method: 'GET',
      url: '/corrupt.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers.vary).toBe('Origin, Accept')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.rawPayload).toEqual(corruptPayload)

    await errorServer.close()
  })
})
