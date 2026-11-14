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

export function isMediaTypeAccepted(accept: string, mediaType: string): boolean {
  if (!accept) {
    return false
  }

  const target = mediaType.toLowerCase()
  for (const part of accept.split(',')) {
    const [rawType, ...params] = part.split(';')
    if (rawType.trim().toLowerCase() !== target) {
      continue
    }

    let q = 1
    for (const param of params) {
      const [rawKey, rawVal] = param.split('=')
      if (rawKey?.trim().toLowerCase() === 'q' && rawVal !== undefined) {
        const parsed = Number.parseFloat(rawVal.trim())
        if (!Number.isNaN(parsed)) {
          q = parsed
        }
      }
    }

    if (q > 0) {
      return true
    }
  }

  return false
}

export function getBestFormat(
  accept: string = '',
  metadata: Metadata,
  formats: CompressionConfig[],
  flattened: boolean = false,
): CompressionConfig | false {
  const hasAlpha = !flattened && metadata.hasAlpha === true
  const sorted = formats
    .filter(item =>
      item.enabled
      && (!hasAlpha || item.alpha)
      && (flattened || !(metadata.format === 'png' && item.format === 'jpeg'))
      && item.supported(accept),
    )
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

const SAFE_REMBG_MODEL_REGEX = /^[a-z0-9][\w-]*$/i

export interface RemoveBackgroundOptions {
  allowedModels?: string[]
  timeoutMs?: number
  concurrency?: number
  endpoint?: string
  signal?: AbortSignal
}

export function validateRembgModel(model: string, allowedModels?: string[]): void {
  if (!SAFE_REMBG_MODEL_REGEX.test(model)) {
    throw new Error(`Invalid rembg model "${model}"`)
  }
  if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(model)) {
    throw new Error(`rembg model "${model}" is not in allowedModels`)
  }
}

let activeRembgCount = 0
const rembgWaitQueue: Array<() => void> = []

async function withConcurrencyLimit<T>(limit: number | undefined, fn: () => Promise<T>): Promise<T> {
  if (limit === undefined || limit <= 0 || !Number.isFinite(limit)) {
    return fn()
  }

  if (activeRembgCount >= limit) {
    await new Promise<void>(resolve => rembgWaitQueue.push(resolve))
  }

  activeRembgCount++
  try {
    return await fn()
  }
  finally {
    activeRembgCount--
    const next = rembgWaitQueue.shift()
    if (next) {
      next()
    }
  }
}

async function removeBackgroundViaEndpoint(
  input: Buffer,
  model: string,
  endpoint: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const form = new FormData()
  form.append('file', new Blob([
    new Uint8Array(input),
  ]), 'image')
  form.append('model', model)

  const signals: AbortSignal[] = []
  if (signal) {
    signals.push(signal)
  }
  if (timeoutMs !== undefined && timeoutMs > 0) {
    signals.push(AbortSignal.timeout(timeoutMs))
  }
  const combinedSignal = signals.length > 0
    ? AbortSignal.any(signals)
    : undefined

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: combinedSignal,
  })

  if (!response.ok) {
    throw new Error(`rembg endpoint responded with ${response.status} ${response.statusText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function removeBackgroundViaSpawn(
  input: Buffer,
  model: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('rembg aborted')
  }

  const child = spawn('rembg', ['i', '-m', model])

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined

    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    const fail = (err: Error) => {
      if (!settled) {
        settled = true
        cleanup()
        reject(err)
      }
    }

    onAbort = () => {
      child.kill()
      fail(signal?.reason instanceof Error
        ? signal.reason
        : new Error('rembg aborted'))
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    if (timeoutMs !== undefined && timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill()
        fail(new Error(`rembg timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }

    const stdoutPromise = buffer(child.stdout)
    const stderrPromise = buffer(child.stderr).catch(() => Buffer.alloc(0))

    child.on('error', fail)

    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        fail(err)
      }
    })

    child.on('close', (code, sig) => {
      if (settled) {
        return
      }

      if (code !== 0) {
        void stderrPromise.then((buf) => {
          fail(formatExitError(code, sig, buf))
        })
        return
      }

      void stdoutPromise.then(
        (output) => {
          if (!settled) {
            settled = true
            cleanup()
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

export async function removeBackground(
  input: Buffer,
  model = 'u2netp',
  options?: RemoveBackgroundOptions,
): Promise<Buffer> {
  validateRembgModel(model, options?.allowedModels)

  return withConcurrencyLimit(options?.concurrency, async () => {
    if (options?.endpoint !== undefined && options.endpoint !== '') {
      return removeBackgroundViaEndpoint(input, model, options.endpoint, options.timeoutMs, options.signal)
    }
    return removeBackgroundViaSpawn(input, model, options?.timeoutMs, options?.signal)
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
