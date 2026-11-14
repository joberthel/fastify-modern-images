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

function formatExitError(code: number | null, signal: NodeJS.Signals | null, stderrBuffer: Buffer): Error {
  const stderr = stderrBuffer.toString().trim()
  const status = code !== null
    ? `code ${code}`
    : `signal ${signal ?? 'unknown'}`
  const details = stderr
    ? `: ${stderr}`
    : ''
  return new Error(`rembg exited with ${status}${details}`)
}

export async function removeBackground(input: Buffer, model = 'u2netp'): Promise<Buffer> {
  const child = spawn('rembg', ['i', '-m', model])

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false

    const fail = (err: Error) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    }

    const stdoutPromise = stream2buffer(child.stdout)
    const stderrPromise = stream2buffer(child.stderr).catch(() => Buffer.alloc(0))

    child.on('error', fail)

    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        fail(err)
      }
    })

    child.on('close', (code, signal) => {
      if (settled) {
        return
      }

      if (code !== 0) {
        void stderrPromise.then((buf) => {
          fail(formatExitError(code, signal, buf))
        })
        return
      }

      void stdoutPromise.then(
        (output) => {
          if (!settled) {
            settled = true
            resolve(output)
          }
        },
        (err: unknown) => {
          fail(err instanceof Error
            ? err
            : new Error(String(err)))
        },
      )
    })

    child.stdin.end(input)
  })
}

export function appendVaryHeader(
  existing: number | string | string[] | undefined,
  value: string,
): string {
  const rawValues = existing === undefined
    ? []
    : Array.isArray(existing)
      ? existing
      : [
          String(existing),
        ]

  const parts = rawValues
    .flatMap(item => item.split(','))
    .map(item => item.trim())
    .filter(item => item.length > 0)

  const target = value.toLowerCase()
  if (!parts.some(item => item.toLowerCase() === target)) {
    parts.push(value)
  }

  return parts.join(', ')
}
