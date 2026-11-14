import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { DEFAULT_MAX_INPUT_BYTES } from '../config'
import { readStreamCapped, readStreamWithLimit } from '../stream'

const SAFE_REMBG_MODEL_REGEX = /^[a-z0-9][\w-]*$/i
const MAX_STDERR_BYTES = 64 * 1024

export interface RemoveBackgroundOptions {
  allowedModels?: string[]
  timeoutMs?: number
  concurrency?: number
  endpoint?: string
  signal?: AbortSignal
  maxOutputBytes?: number
}

interface EndpointCallOptions {
  endpoint: string
  timeoutMs?: number
  signal?: AbortSignal
  maxOutputBytes: number
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
  options: EndpointCallOptions,
): Promise<Buffer> {
  const { endpoint, timeoutMs, signal } = options
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

  const contentLength = response.headers?.get('content-length') ?? null
  if (contentLength !== null) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > options.maxOutputBytes) {
      await response.body?.cancel()
      throw new Error(`rembg endpoint response exceeded maximum allowed size of ${options.maxOutputBytes} bytes`)
    }
  }

  if (response.body) {
    return readStreamWithLimit(
      Readable.fromWeb(response.body),
      options.maxOutputBytes,
    )
  }

  const buf = Buffer.from(await response.arrayBuffer())
  if (buf.length > options.maxOutputBytes) {
    throw new Error(`rembg endpoint response exceeded maximum allowed size of ${options.maxOutputBytes} bytes`)
  }
  return buf
}

function setupAbortAndTimeout(
  child: ChildProcessWithoutNullStreams,
  fail: (err: Error) => void,
  timeoutMs?: number,
  signal?: AbortSignal,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const onAbort = () => {
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

  return () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

async function removeBackgroundViaSpawn(
  input: Buffer,
  model: string,
  maxOutputBytes: number,
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
    let cleanup = () => {}

    const fail = (err: Error) => {
      if (!settled) {
        settled = true
        cleanup()
        reject(err)
      }
    }

    cleanup = setupAbortAndTimeout(child, fail, timeoutMs, signal)

    const stdoutPromise = readStreamWithLimit(child.stdout, maxOutputBytes)
    stdoutPromise.catch((err: unknown) => {
      child.kill()
      fail(err instanceof Error
        ? err
        : new Error(String(err)))
    })
    const stderrPromise = readStreamCapped(child.stderr, MAX_STDERR_BYTES).catch(() => Buffer.alloc(0))

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
        void stderrPromise.then(buf => fail(formatExitError(code, sig, buf)))
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
        (err: unknown) => fail(err instanceof Error
          ? err
          : new Error(String(err))),
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
  const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_INPUT_BYTES

  return withConcurrencyLimit(options?.concurrency, async () => {
    if (options?.endpoint !== undefined && options.endpoint !== '') {
      return removeBackgroundViaEndpoint(input, model, {
        endpoint: options.endpoint,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        maxOutputBytes,
      })
    }
    return removeBackgroundViaSpawn(input, model, maxOutputBytes, options?.timeoutMs, options?.signal)
  })
}
