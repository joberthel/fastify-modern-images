import type { Stream } from 'node:stream'
import type { Metadata } from 'sharp'
import type { CompressionConfig } from './types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { buffer } from 'node:stream/consumers'

export function guard(regex: RegExp, path: string = '/'): boolean {
  return regex.test(path)
}

export function validatePayload(contentType: string | string[] | number = '', validContentTypes: string[], payload: unknown): boolean {
  if (Array.isArray(contentType) || typeof contentType === 'number') {
    return false
  }

  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase()
  const normalizedValidContentTypes = validContentTypes.map(type => type.trim().toLowerCase())

  return normalizedValidContentTypes.includes(normalizedContentType) && (isStream(payload) || Buffer.isBuffer(payload))
}

export function getBestFormat(accept: string = '', metadata: Metadata, formats: CompressionConfig[]): CompressionConfig | false {
  const sorted = formats
    .filter(item => item.enabled && (metadata.hasAlpha !== true || item.alpha) && item.supported(accept))
    .sort((a, b) => b.priority - a.priority)

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

    const stdoutPromise = buffer(child.stdout)
    const stderrPromise = buffer(child.stderr).catch(() => Buffer.alloc(0))

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function mergeInto(result: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || value === undefined) {
      continue
    }

    const existing = result[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(existing, value)
    }
    else if (isPlainObject(value)) {
      result[key] = deepMerge(value)
    }
    else {
      result[key] = value
    }
  }
}

export function deepMerge<T extends object>(
  target: T,
  ...sources: Array<object | undefined>
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    if (key === '__proto__') {
      continue
    }
    result[key] = isPlainObject(value)
      ? deepMerge(value)
      : value
  }

  for (const source of sources) {
    if (source) {
      mergeInto(result, source as Record<string, unknown>)
    }
  }

  return result as T
}
