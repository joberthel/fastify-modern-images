import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { CoalescedPipelineResult } from './pipeline'
import type * as Types from './types'
import fp from 'fastify-plugin'
import { resolveOptions } from './config'
import { validatePayload } from './negotiation'
import { InputLimitExceededError as PipelineInputLimitExceededError, processedReplies, processPayload } from './pipeline'
import { createConcurrencyLimiter } from './providers/rembg'
import { matchesUrlPattern } from './validation'

async function fastifyModernImages(
  fastify: FastifyInstance,
  opts: Types.FastifyModernImagesOptions = {},
) {
  const options = resolveOptions(opts)
  const contentTypes = new Set(Object.values(options.compression).map(item => item.contentType.trim().toLowerCase()))
  const inFlight = new Map<string, Promise<CoalescedPipelineResult>>()
  const rembgLimiter = createConcurrencyLimiter(options.rembg.concurrency)

  fastify.addHook('onSend', async (request: FastifyRequest<Types.ImageTransformRequest>, reply, payload) => {
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

// eslint-disable-next-line ts/no-namespace
namespace fastifyModernImages {
  export type FastifyModernImagesOptions = Types.FastifyModernImagesOptions
  export type FastifyModernImagesOptionsCompression = Types.FastifyModernImagesOptionsCompression
  export type ResolvedFastifyModernImagesOptions = Types.ResolvedFastifyModernImagesOptions
  export type ImageTransformRequest = Types.ImageTransformRequest
  export type ImageTransformQuerystring = Types.ImageTransformQuerystring
  export type CompressionConfig = Types.CompressionConfig
  export type RembgOptions = Types.RembgOptions
  export type ImageFormat = Types.ImageFormat
  /** @deprecated Use ImageTransformQuerystring instead. */
  // eslint-disable-next-line ts/no-deprecated
  export type MinifyQuerystring = Types.MinifyQuerystring
  /** @deprecated Use ImageTransformRequest instead. */
  // eslint-disable-next-line ts/no-deprecated
  export type MinifyRequest = Types.MinifyRequest
  export type InputLimitExceededError = PipelineInputLimitExceededError
  /* v8 ignore start */
  export const InputLimitExceededError = PipelineInputLimitExceededError
}
/* v8 ignore stop */

fp(fastifyModernImages, {
  fastify: '5.x',
  name: 'fastify-modern-images',
})

// Expose named export for Node.js ESM cjs-module-lexer static analysis alongside `export =`
// eslint-disable-next-line ts/no-unsafe-member-access
module.exports.InputLimitExceededError = PipelineInputLimitExceededError

// eslint-disable-next-line no-restricted-syntax
export = fastifyModernImages
