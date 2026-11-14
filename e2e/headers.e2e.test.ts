import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
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

  it('removes stale ETag header on transformed WebP response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers.etag).toBeUndefined()
    expect(res.headers['accept-ranges']).toBeUndefined()
  })

  it('removes stale ETag header on transformed AVIF response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg?width=150',
      headers: {
        accept: 'image/avif',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/avif')
    expect(res.headers.etag).toBeUndefined()
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

  it('skips non-GET requests', async () => {
    const res = await server.inject({
      method: 'HEAD',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
  })
})
