import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { FastifyModernImagesOptions, MinifyRequest } from './types'
import fp from 'fastify-plugin'
import { resolveOptions } from './config'
import { guard, validatePayload } from './negotiation'
import { processedReplies, processPayload } from './pipeline'

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
  const options = resolveOptions(opts)
  const contentTypes = Object.values(options.compression).map(item => item.contentType)

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

    return processPayload(request, reply, payload, options)
  })
}

export default fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})
