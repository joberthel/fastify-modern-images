import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { CoalescedPipelineResult } from './pipeline'
import type { FastifyModernImagesOptions, ImageTransformRequest } from './types'
import fp from 'fastify-plugin'
import { resolveOptions } from './config'
import { validatePayload } from './negotiation'
import { processedReplies, processPayload, toHeadPayload } from './pipeline'
import { createConcurrencyLimiter } from './providers/rembg'
import { matchesUrlPattern } from './validation'

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options = resolveOptions(opts)
  const contentTypes = new Set(Object.values(options.compression).map(item => item.contentType.trim().toLowerCase()))
  const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
  const rembgLimiter = createConcurrencyLimiter(options.rembg.concurrency)
  const headRequests = new WeakSet<FastifyRequest>()

  fastify.addHook('onRequest', async (request: FastifyRequest<ImageTransformRequest>) => {
    if (request.method === 'HEAD' && matchesUrlPattern(options.urlPattern, request.raw.url)) {
      headRequests.add(request)
      request.raw.method = 'GET'
    }
  })

  fastify.addHook('onSend', async (request: FastifyRequest<ImageTransformRequest>, reply, payload) => {
    const isHead = headRequests.has(request)
    if (isHead) {
      request.raw.method = 'HEAD'
    }

    if (processedReplies.has(reply)) {
      return payload
    }

    if (
      (request.method !== 'GET' && !isHead)
      || reply.statusCode !== 200
      || !matchesUrlPattern(options.urlPattern, request.raw?.url)
      || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)
    ) {
      return isHead
        ? toHeadPayload(reply, payload)
        : payload
    }

    if (options.verifyRequest && !(await options.verifyRequest(request))) {
      return isHead
        ? toHeadPayload(reply, payload)
        : payload
    }

    return processPayload(request, reply, payload, options, inFlight, rembgLimiter, isHead)
  })
}

const plugin = fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})

// eslint-disable-next-line no-restricted-syntax
export = plugin
