import type { Stream } from 'node:stream'
import type { Metadata } from 'sharp'
import type { FastifyModernImagesOptionsCompression } from './types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

export async function stream2buffer(stream: Stream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const _buf: Buffer[] = []

    stream.on('data', (chunk: Buffer) => _buf.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(_buf)))
    stream.on('error', err => reject(new Error(`error converting stream - ${err}`)))
  })
}

export function guard(regex: RegExp, path: string = '/'): boolean {
  return regex.test(path)
}

export function validatePayload(contentType: string | string[] | number = '', validContentTypes: string[], payload: unknown): boolean {
  if (Array.isArray(contentType) || typeof contentType === 'number') {
    return false
  }

  return validContentTypes.includes(contentType) && (isStream(payload) || Buffer.isBuffer(payload))
}

export function getBestFormat(accept: string = '', metadata: Metadata, formats: FastifyModernImagesOptionsCompression[]): FastifyModernImagesOptionsCompression | false {
  const sorted = formats
    .filter(item => Boolean(item.enabled) && (metadata.hasAlpha !== true || Boolean(item.alpha)) && (item.supported?.(accept) ?? false))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  if (sorted.length > 0) {
    return sorted[0]
  }

  return false
}

export function isStream(stream: unknown): stream is Stream {
  return stream !== null && typeof stream === 'object' && 'pipe' in stream && typeof stream.pipe === 'function'
}

export async function removeBackground(input: Buffer, model = 'u2netp'): Promise<Buffer> {
  const child = spawn('rembg', ['i', '-m', model])

  return new Promise((resolve) => {
    child.stdin.write(input, () => {
      child.stdin.end()

      resolve(stream2buffer(child.stdout))
    })
  })
}
