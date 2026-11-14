import type { FastifyInstance } from 'fastify'
import type { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fastifyModernImages from '../src'

async function fetchImage(
  server: FastifyInstance,
  requestPath: string,
  accept = '',
): Promise<{ contentType: string, body: Buffer }> {
  const res = await server.inject({
    method: 'GET',
    url: requestPath,
    headers: {
      accept,
    },
  })
  const rawContentType = res.headers['content-type']
  let contentType = ''
  if (typeof rawContentType === 'string') {
    contentType = rawContentType
  }
  return { contentType, body: res.rawPayload }
}

async function fetch(server: FastifyInstance, requestPath: string, accept = ''): Promise<string> {
  const { contentType } = await fetchImage(server, requestPath, accept)
  return contentType
}

async function createDefaultServer(): Promise<FastifyInstance> {
  const server = fastify()

  server.register(fastifyModernImages)
  server.register(fastifyStatic, {
    root: path.join(__dirname, '../example/public'),
    prefix: '/',
  })

  server.get('/buffer.jpg', async (request, reply) => {
    const buffer = await fs.readFile(path.join(__dirname, '../example/public/test.jpg'))
    return reply.header('Content-Type', 'image/jpeg').send(buffer)
  })

  await server.ready()
  return server
}

describe('default behaviour - formats', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return avif', async () => {
    const { contentType, body } = await fetchImage(server, '/test.jpg', 'image/avif,image/webp')
    expect(contentType).toBe('image/avif')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('heif')
  })

  it('should return webp', async () => {
    const { contentType, body } = await fetchImage(server, '/test.jpg', 'image/webp')
    expect(contentType).toBe('image/webp')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('webp')
  })

  it('should return jpeg', async () => {
    const { contentType, body } = await fetchImage(server, '/test.jpg')
    expect(contentType).toBe('image/jpeg')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('jpeg')
  })

  it('should return png', async () => {
    const { contentType, body } = await fetchImage(server, '/test-alpha.png')
    expect(contentType).toBe('image/png')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('png')
  })

  it('should return png for opaque png when no modern format is accepted', async () => {
    const { contentType, body } = await fetchImage(server, '/test.png', 'image/png')
    expect(contentType).toBe('image/png')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('png')
  })

  it('should work with buffer', async () => {
    const { contentType, body } = await fetchImage(server, '/buffer.jpg', 'image/avif,image/webp')
    expect(contentType).toBe('image/avif')
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe('heif')
  })
})

describe('default behaviour - transformations', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return jpeg with transformation', async () => {
    const w150 = await fetchImage(server, '/test.jpg?width=150')
    expect(w150.contentType).toBe('image/jpeg')
    expect((await sharp(w150.body).metadata()).width).toBe(150)

    const h150 = await fetchImage(server, '/test.jpg?height=150')
    expect(h150.contentType).toBe('image/jpeg')
    expect((await sharp(h150.body).metadata()).height).toBe(150)

    const contain = await fetchImage(server, '/test.jpg?width=150&height=150&fit=contain')
    expect(contain.contentType).toBe('image/jpeg')
    const containMeta = await sharp(contain.body).metadata()
    expect(containMeta.width).toBe(150)
    expect(containMeta.height).toBe(150)

    const posLeft = await fetchImage(server, '/test.jpg?width=150&height=150&position=left')
    expect(posLeft.contentType).toBe('image/jpeg')
    const posLeftMeta = await sharp(posLeft.body).metadata()
    expect(posLeftMeta.width).toBe(150)
    expect(posLeftMeta.height).toBe(150)
  })

  it('should return jpeg with transformation and background', async () => {
    const { contentType, body } = await fetchImage(server, '/test.jpg?width=800&height=200&fit=contain&background=white')
    expect(contentType).toBe('image/jpeg')
    const meta = await sharp(body).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(200)
    const { data } = await sharp(body).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(240)
    expect(data[1]).toBeGreaterThan(240)
    expect(data[2]).toBeGreaterThan(240)
  })

  it('should return jpeg with rotation', async () => {
    const original = await fetchImage(server, '/test.jpg')
    const originalMeta = await sharp(original.body).metadata()

    for (const query of ['rotation=45', 'r=45']) {
      const { contentType, body } = await fetchImage(server, `/test.jpg?${query}`)
      expect(contentType).toBe('image/jpeg')
      const meta = await sharp(body).metadata()
      expect(meta.width).not.toBe(originalMeta.width)
      expect(meta.height).not.toBe(originalMeta.height)
    }
  })

  it('should return jpeg with rotation and background', async () => {
    const original = await fetchImage(server, '/test.jpg')
    const originalMeta = await sharp(original.body).metadata()

    for (const query of ['rotation=45&background=white', 'r=45&b=white']) {
      const { contentType, body } = await fetchImage(server, `/test.jpg?${query}`)
      expect(contentType).toBe('image/jpeg')
      const meta = await sharp(body).metadata()
      expect(meta.width).not.toBe(originalMeta.width)
      const { data } = await sharp(body).raw().toBuffer({ resolveWithObject: true })
      expect(data[0]).toBeGreaterThan(240)
      expect(data[1]).toBeGreaterThan(240)
      expect(data[2]).toBeGreaterThan(240)
    }
  })

  it('should return jpeg with different quality', async () => {
    const original = await fetchImage(server, '/test.jpg')

    for (const query of ['quality=3', 'q=3']) {
      const { contentType, body } = await fetchImage(server, `/test.jpg?${query}`)
      expect(contentType).toBe('image/jpeg')
      expect(body.length).toBeLessThan(original.body.length)
    }
  })

  it('should return trimmed jpeg', async () => {
    const original = await fetchImage(server, '/product.jpeg')
    const originalMeta = await sharp(original.body).metadata()

    for (const query of ['trim', 't']) {
      const { contentType, body } = await fetchImage(server, `/product.jpeg?${query}`)
      expect(contentType).toBe('image/jpeg')
      const meta = await sharp(body).metadata()
      expect(meta.width).toBeLessThan(originalMeta.width!)
      expect(meta.height).toBeLessThan(originalMeta.height!)
    }
  })
})

describe('guard behaviour', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = fastify()

    server.register(fastifyModernImages, { regex: /^[^?]+$/ })
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return avif', async () => {
    expect(await fetch(server, '/test.jpg?foo', 'image/avif,image/webp')).toBe('image/jpeg')
  })

  it('should return png', async () => {
    expect(await fetch(server, '/test.png?foo', 'image/avif,image/webp')).toBe('image/png')
  })
})

describe('passthrough behaviour', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = fastify()

    server.register(fastifyModernImages, {
      compression: {
        jpeg: { enabled: false, format: 'jpeg' },
        webp: { enabled: false, format: 'webp' },
        avif: { enabled: false, format: 'avif' },
        png: { enabled: false, format: 'png' },
      },
    })
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return jpeg', async () => {
    expect(await fetch(server, '/test.jpg', 'image/avif,image/webp')).toBe('image/jpeg')
  })
})

describe('immutability of defaults and format.options', () => {
  it('should not mutate defaults across plugin registrations', async () => {
    const server1 = fastify()
    server1.register(fastifyModernImages, {
      compression: {
        avif: { enabled: false, format: 'avif' },
      },
    })
    server1.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    const server2 = fastify()
    server2.register(fastifyModernImages)
    server2.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    const res1 = await server1.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/avif,image/webp' },
    })
    expect(res1.headers['content-type']).toBe('image/webp')

    const res2 = await server2.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/avif,image/webp' },
    })
    expect(res2.headers['content-type']).toBe('image/avif')

    await server1.close()
    await server2.close()
  })
})

describe('vary header', () => {
  it('sets Vary: Accept when processing an image', async () => {
    const server = fastify()
    server.register(fastifyModernImages)
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/webp' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers.vary).toBe('Accept')

    await server.close()
  })

  it('preserves existing Vary header values without duplicating Accept', async () => {
    const server = fastify()
    server.register(fastifyModernImages)
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    server.get('/with-origin.jpg', (_request, reply) => {
      reply.header('Vary', 'Origin')
      return reply.sendFile('test.jpg')
    })
    server.get('/with-accept.jpg', (_request, reply) => {
      reply.header('Vary', 'Origin, accept')
      return reply.sendFile('test.jpg')
    })

    const resOrigin = await server.inject({
      method: 'GET',
      url: '/with-origin.jpg',
      headers: { accept: 'image/webp' },
    })
    expect(resOrigin.headers.vary).toBe('Origin, Accept')

    const resAccept = await server.inject({
      method: 'GET',
      url: '/with-accept.jpg',
      headers: { accept: 'image/webp' },
    })
    expect(resAccept.headers.vary).toBe('Origin, accept')

    await server.close()
  })

  it('does not set Vary: Accept on passthrough responses', async () => {
    const server = fastify()
    server.register(fastifyModernImages)
    server.get('/text', (_request, reply) => reply.type('text/plain').send('ok'))

    const res = await server.inject({
      method: 'GET',
      url: '/text',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers.vary).toBeUndefined()

    await server.close()
  })
})

describe('issue #36: flatten, q=0, and early format check', () => {
  it('selects jpeg for alpha png when flattened with background', async () => {
    const server = fastify()
    server.register(fastifyModernImages)
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    const res = await server.inject({
      method: 'GET',
      url: '/test-alpha.png?background=white',
      headers: { accept: 'image/jpeg' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')

    await server.close()
  })

  it('respects Accept q=0 for avif and webp', async () => {
    const server = fastify()
    server.register(fastifyModernImages)
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })

    const resAvifZero = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/avif;q=0, image/webp;q=0.8' },
    })
    expect(resAvifZero.statusCode).toBe(200)
    expect(resAvifZero.headers['content-type']).toBe('image/webp')

    const resBothZero = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: { accept: 'image/avif;q=0, image/webp;q=0' },
    })
    expect(resBothZero.statusCode).toBe(200)
    expect(resBothZero.headers['content-type']).toBe('image/jpeg')

    await server.close()
  })
})
