import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readStreamCapped, readStreamWithLimit } from '../src/stream'

describe('readStreamWithLimit', () => {
  it('reads stream within limit', async () => {
    const stream = Readable.from([
      Buffer.from('hello '),
      Buffer.from('world'),
    ])
    const result = await readStreamWithLimit(stream, 11)
    expect(result.toString()).toBe('hello world')
  })

  it('rejects and destroys stream when limit is exceeded', async () => {
    const stream = Readable.from([
      Buffer.from('12345'),
      Buffer.from('67890'),
    ])
    await expect(readStreamWithLimit(stream, 8)).rejects.toThrow(
      'Stream exceeded maximum allowed size of 8 bytes',
    )
    expect(stream.destroyed).toBe(true)
  })

  it('handles string chunks', async () => {
    const stream = Readable.from(['abc', 'def'])
    const result = await readStreamWithLimit(stream, 6)
    expect(result.toString()).toBe('abcdef')
  })
})

describe('readStreamCapped', () => {
  it('caps buffered bytes while draining the stream', async () => {
    const stream = Readable.from([
      Buffer.from('12345'),
      Buffer.from('67890'),
      Buffer.from('abcde'),
    ])
    const result = await readStreamCapped(stream, 8)
    expect(result.toString()).toBe('12345678')
    expect(result.length).toBe(8)
  })

  it('returns full content when under cap', async () => {
    const stream = Readable.from([
      Buffer.from('short'),
    ])
    const result = await readStreamCapped(stream, 64)
    expect(result.toString()).toBe('short')
  })
})
