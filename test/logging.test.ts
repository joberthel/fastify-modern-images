import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import fastifyModernImages from '../src'

describe('request logging', () => {
  let server: FastifyInstance
  const infoMessages: string[] = []

  beforeAll(async () => {
    server = fastify()
    server.addHook('onRequest', async (request) => {
      vi.spyOn(request.log, 'info').mockImplementation((...args: unknown[]) => {
        if (typeof args[0] === 'string') {
          infoMessages.push(args[0])
        }
      })
    })
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

  it('logs conversion summary without a stray trailing parenthesis', async () => {
    infoMessages.length = 0

    const res = await server.inject({
      method: 'GET',
      url: '/test.jpg',
      headers: {
        accept: 'image/webp',
      },
    })

    expect(res.statusCode).toBe(200)
    const conversionLog = infoMessages.find(msg => msg.startsWith('Input: '))
    expect(conversionLog).toBeDefined()
    expect(conversionLog).toMatch(/^Input: image\/jpeg, Output: image\/webp, Quality: \d+, Reduction: -?\d+%$/)
    expect(conversionLog).not.toMatch(/\)$/)
  })
})
