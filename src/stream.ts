import { Buffer } from 'node:buffer'

export async function readStreamWithLimit(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array | string)
    totalBytes += buf.length
    if (totalBytes > maxBytes) {
      if ('destroy' in stream && typeof (stream as { destroy?: () => void }).destroy === 'function') {
        (stream as { destroy: () => void }).destroy()
      }
      throw new Error(`Stream exceeded maximum allowed size of ${maxBytes} bytes`)
    }
    chunks.push(buf)
  }

  return Buffer.concat(chunks, totalBytes)
}

export async function readStreamCapped(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of stream) {
    if (totalBytes >= maxBytes) {
      continue
    }
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array | string)
    const remaining = maxBytes - totalBytes
    const slice = buf.length > remaining
      ? buf.subarray(0, remaining)
      : buf
    chunks.push(slice)
    totalBytes += slice.length
  }

  return Buffer.concat(chunks, totalBytes)
}
