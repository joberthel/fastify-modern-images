import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fastifyModernImages from '../src'

async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetch(requestPath: string, accept = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4567,
        method: 'GET',
        path: requestPath,
        headers: {
          accept,
        },
      },
      (res) => {
        resolve(res.headers['content-type'] ?? '')
      },
    )

    req.on('error', (error) => {
      reject(error)
    })

    req.end()
  })
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

  await server.listen({ port: 4567 })
  return server
}

describe('default behaviour - formats', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    await sleep(10)
    await server.close()
  })

  it('should return avif', async () => {
    expect(await fetch('/test.jpg', 'image/avif,image/webp')).toBe('image/avif')
  })

  it('should return webp', async () => {
    expect(await fetch('/test.jpg', 'image/webp')).toBe('image/webp')
  })

  it('should return jpeg', async () => {
    expect(await fetch('/test.jpg')).toBe('image/jpeg')
  })

  it('should return png', async () => {
    expect(await fetch('/test-alpha.png')).toBe('image/png')
  })

  it('should work with buffer', async () => {
    expect(await fetch('/buffer.jpg', 'image/avif,image/webp')).toBe('image/avif')
  })
})

describe('default behaviour - transformations', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    await sleep(10)
    await server.close()
  })

  it('should return jpeg with transformation', async () => {
    expect(await fetch('/test.jpg?width=150')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?height=150')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?width=150&height=150&fit=contain')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?width=150&height=150&position=left')).toBe('image/jpeg')
  })

  it('should return jpeg with transformation and background', async () => {
    expect(await fetch('/test.jpg?width=800&height=200&fit=contain&background=white')).toBe('image/jpeg')
  })

  it('should return jpeg with rotation', async () => {
    expect(await fetch('/test.jpg?rotation=45')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?r=45')).toBe('image/jpeg')
  })

  it('should return jpeg with rotation and background', async () => {
    expect(await fetch('/test.jpg?rotation=45&background=white')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?r=45&bg=white')).toBe('image/jpeg')
  })

  it('should return jpeg with different quality', async () => {
    expect(await fetch('/test.jpg?quality=3')).toBe('image/jpeg')
    expect(await fetch('/test.jpg?q=3')).toBe('image/jpeg')
  })

  it('should return trimmed jpeg', async () => {
    expect(await fetch('/product.jpeg?trim')).toBe('image/jpeg')
    expect(await fetch('/product.jpeg?t')).toBe('image/jpeg')
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

    await server.listen({ port: 4567 })
  })

  afterAll(async () => {
    await sleep(10)
    await server.close()
  })

  it('should return avif', async () => {
    expect(await fetch('/test.jpg?foo', 'image/avif,image/webp')).toBe('image/jpeg')
  })

  it('should return png', async () => {
    expect(await fetch('/test.png?foo', 'image/avif,image/webp')).toBe('image/png')
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

    await server.listen({ port: 4567 })
  })

  afterAll(async () => {
    await sleep(10)
    await server.close()
  })

  it('should return jpeg', async () => {
    expect(await fetch('/test.jpg', 'image/avif,image/webp')).toBe('image/jpeg')
  })
})
