import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createConcurrencyLimiter, removeBackground } from '../src/providers/rembg'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

function createMockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    stderr: PassThrough
  }
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

describe('rembg - removeBackground (success and errors)', () => {
  it('should resolve with stdout buffer on success', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const input = Buffer.from('input-image')
    const expectedOutput = Buffer.from('output-image')

    const promise = removeBackground(input, 'u2net')

    expect(spawn).toHaveBeenCalledWith('rembg', ['i', '-m', 'u2net'])

    child.stdout.end(expectedOutput)
    child.stderr.end()
    child.emit('close', 0, null)

    const result = await promise
    expect(result).toEqual(expectedOutput)
  })

  it('should reject when child emits error (e.g. ENOENT)', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))
    const err = Object.assign(new Error('spawn rembg ENOENT'), { code: 'ENOENT' })
    child.emit('error', err)

    await expect(promise).rejects.toThrow('spawn rembg ENOENT')
  })

  it('should reject on non-EPIPE stdin error', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))
    const err = Object.assign(new Error('stdin failed'), { code: 'EIO' })
    child.stdin.emit('error', err)

    await expect(promise).rejects.toThrow('stdin failed')
  })
})

describe('rembg - removeBackground (exit codes and signals)', () => {
  it('should reject with exit code and stderr on non-zero exit', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    child.stdout.end()
    child.stderr.end('model not found')
    child.emit('close', 1, null)

    await expect(promise).rejects.toMatchObject({
      message: 'rembg exited with code 1',
      cause: { stderr: 'model not found' },
    })
  })

  it('should reject with signal when terminated by signal', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    child.stdout.end()
    child.stderr.end()
    child.emit('close', null, 'SIGKILL')

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return err instanceof Error
        && err.message === 'rembg exited with signal SIGKILL'
        && err.cause === undefined
    })
  })

  it('should ignore stdin EPIPE error and report close exit code', async () => {
    const child = createMockChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'))

    const epipeErr = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    child.stdin.emit('error', epipeErr)

    child.stdout.end()
    child.stderr.end('broken pipe')
    child.emit('close', 1, null)

    await expect(promise).rejects.toThrow('rembg exited with code 1')
  })
})

describe('rembg - removeBackground (validation, timeout, concurrency, endpoint)', () => {
  it('rejects invalid model names and models not in allowedModels', async () => {
    await expect(removeBackground(Buffer.from('img'), '--help')).rejects.toThrow('Invalid rembg model "--help"')
    await expect(removeBackground(Buffer.from('img'), '../bad')).rejects.toThrow('Invalid rembg model "../bad"')
    await expect(
      removeBackground(Buffer.from('img'), 'u2net', {
        allowedModels: ['isnet-general-use'],
      }),
    ).rejects.toThrow('rembg model "u2net" is not in allowedModels')
  })

  it('times out and kills child process when timeoutMs expires', async () => {
    vi.useFakeTimers()
    const child = createMockChildProcess()
    const killSpy = vi.fn()
    Object.assign(child, { kill: killSpy })
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'), 'u2net', { timeoutMs: 50 })
    vi.advanceTimersByTime(50)

    await expect(promise).rejects.toThrow('rembg timed out after 50ms')
    expect(killSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('rejects when AbortSignal is already aborted or aborts mid-flight', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      removeBackground(Buffer.from('input-image'), 'u2net', { signal: controller.signal }),
    ).rejects.toThrow('cancelled')

    const midController = new AbortController()
    const child = createMockChildProcess()
    const killSpy = vi.fn()
    Object.assign(child, { kill: killSpy })
    vi.mocked(spawn).mockReturnValueOnce(child as never)

    const promise = removeBackground(Buffer.from('input-image'), 'u2net', { signal: midController.signal })
    midController.abort(new Error('aborted mid-flight'))

    await expect(promise).rejects.toThrow('aborted mid-flight')
    expect(killSpy).toHaveBeenCalledTimes(1)
  })

  it('enforces concurrency limit on removeBackground calls', async () => {
    const child1 = createMockChildProcess()
    const child2 = createMockChildProcess()
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as never)
      .mockReturnValueOnce(child2 as never)

    const spawnCallsBefore = vi.mocked(spawn).mock.calls.length
    const p1 = removeBackground(Buffer.from('img1'), 'u2net', { concurrency: 1 })
    const p2 = removeBackground(Buffer.from('img2'), 'u2net', { concurrency: 1 })

    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(1)

    child1.stdout.end('out1')
    child1.stderr.end()
    child1.emit('close', 0, null)
    await expect(p1).resolves.toEqual(Buffer.from('out1'))

    await Promise.resolve()
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(2)

    child2.stdout.end('out2')
    child2.stderr.end()
    child2.emit('close', 0, null)
    await expect(p2).resolves.toEqual(Buffer.from('out2'))
  })

  it('keeps independent concurrency limiters isolated from each other', async () => {
    const limiterA = createConcurrencyLimiter(1)
    const limiterB = createConcurrencyLimiter(1)

    const childA1 = createMockChildProcess()
    const childA2 = createMockChildProcess()
    const childB1 = createMockChildProcess()
    vi.mocked(spawn)
      .mockReturnValueOnce(childA1 as never)
      .mockReturnValueOnce(childB1 as never)
      .mockReturnValueOnce(childA2 as never)

    const spawnCallsBefore = vi.mocked(spawn).mock.calls.length
    const pA1 = removeBackground(Buffer.from('imgA1'), 'u2net', { limiter: limiterA })
    const pA2 = removeBackground(Buffer.from('imgA2'), 'u2net', { limiter: limiterA })
    const pB1 = removeBackground(Buffer.from('imgB1'), 'u2net', { limiter: limiterB })

    // limiterA allows 1, limiterB allows 1 independently -> 2 spawns immediately
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(2)

    // Completing limiterB does not wake limiterA's queued task
    childB1.stdout.end('outB1')
    childB1.stderr.end()
    childB1.emit('close', 0, null)
    await expect(pB1).resolves.toEqual(Buffer.from('outB1'))
    await Promise.resolve()
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(2)

    // Completing limiterA's active task wakes limiterA's queued task
    childA1.stdout.end('outA1')
    childA1.stderr.end()
    childA1.emit('close', 0, null)
    await expect(pA1).resolves.toEqual(Buffer.from('outA1'))
    await Promise.resolve()
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(3)

    childA2.stdout.end('outA2')
    childA2.stderr.end()
    childA2.emit('close', 0, null)
    await expect(pA2).resolves.toEqual(Buffer.from('outA2'))
  })

  it('uses HTTP endpoint when configured and handles errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await removeBackground(Buffer.from('img'), 'u2net', {
      endpoint: 'http://localhost:7000/api/remove',
      timeoutMs: 5000,
    })
    expect(result).toEqual(Buffer.from([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7000/api/remove',
      expect.objectContaining({ method: 'POST' }),
    )

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })
    await expect(
      removeBackground(Buffer.from('img'), 'u2net', { endpoint: 'http://localhost:7000/api/remove' }),
    ).rejects.toThrow('rembg endpoint responded with 503 Service Unavailable')

    vi.unstubAllGlobals()
  })
})
