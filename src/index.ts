import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { CoalescedPipelineResult } from './pipeline'
import type { FastifyModernImagesOptions, ImageTransformRequest } from './types'
import fp from 'fastify-plugin'
import { resolveOptions } from './config'
import { validatePayload } from './negotiation'
import { processedReplies, processPayload } from './pipeline'
import { createConcurrencyLimiter } from './providers/rembg'
import { matchesUrlPattern } from './validation'

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options = resolveOptions(opts)
  const contentTypes = new Set(Object.values(options.compression).map(item => item.contentType.trim().toLowerCase()))
  const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
  const rembgLimiter = createConcurrencyLimiter(options.rembg.concurrency)

  fastify.addHook('onSend', async (request: FastifyRequest<ImageTransformRequest>, reply, payload) => {
    if (
      processedReplies.has(reply)
      || request.method !== 'GET'
      || reply.statusCode !== 200
      || !matchesUrlPattern(options.urlPattern, request.raw.url)
      || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)
    ) {
      return payload
    }

    if (options.verifyRequest && !(await options.verifyRequest(request))) {
      return payload
    }

    return processPayload(request, reply, payload, options, inFlight, rembgLimiter)
  })
}

const plugin = fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})

// eslint-disable-next-line no-restricted-syntax
export = plugin
