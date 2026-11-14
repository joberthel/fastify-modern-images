import type { FastifyInstance } from 'fastify'
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
    multiServer.register(fastifyModernImages, { quality: 80 })
    multiServer.register(fastifyModernImages, { quality: 10 })
    multiServer.register(fastifyStatic, {
      root: path.join(__dirname, '../example/public'),
      prefix: '/',
    })
    await multiServer.ready()

    const singleServer = fastify()
    singleServer.register(fastifyModernImages, { quality: 80 })
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
})
