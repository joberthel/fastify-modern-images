import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Buffer } from 'node:buffer'
import type { FastifyModernImagesOptions, MinifyRequest } from './types'
import fp from 'fastify-plugin'
import { resolveOptions } from './config'
import { guard, validatePayload } from './negotiation'
import { processedReplies, processPayload } from './pipeline'

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options = resolveOptions(opts)
  const contentTypes = Object.values(options.compression).map(item => item.contentType)
  const inFlight = new Map<string, Promise<Buffer>>()

  fastify.addHook('onSend', async (request: FastifyRequest<MinifyRequest>, reply, payload) => {
    if (
      processedReplies.has(reply)
      || request.method !== 'GET'
      || reply.statusCode !== 200
      || !guard(options.regex, request.raw.url)
      || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)
    ) {
      return payload
    }

    if (options.verifyRequest && !(await options.verifyRequest(request))) {
      return payload
    }

    return processPayload(request, reply, payload, options, inFlight)
  })
}

export default fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})
