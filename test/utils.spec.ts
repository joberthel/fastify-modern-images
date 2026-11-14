import type { FastifyModernImagesOptionsCompression } from '../src/types'
import { Buffer } from 'node:buffer'
import { PassThrough, Stream } from 'node:stream'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { describe, it } from 'mocha'
import { getBestFormat, guard, isStream, stream2buffer, validatePayload } from '../src/utils'

chai.use(chaiAsPromised)

const { expect } = chai

function createFormats(): FastifyModernImagesOptionsCompression[] {
  return [
    {
      enabled: true,
      format: 'jpeg',
      alpha: false,
      priority: 2,
      supported: () => true,
    },
    {
      enabled: false,
      format: 'avif',
      alpha: true,
      priority: 4,
      supported: accept => accept.includes('image/avif'),
    },
    {
      enabled: true,
      format: 'webp',
      alpha: true,
      priority: 3,
      supported: accept => accept.includes('image/webp'),
    },
    {
      enabled: true,
      format: 'png',
      alpha: true,
      priority: 1,
      supported: () => true,
    },
  ]
}

describe('utils - stream and guard', () => {
  it('should convert stream to buffer', async () => {
    let stream = new PassThrough()
    stream.write('foo bar')
    stream.end()

    expect((await stream2buffer(stream)).toString()).to.eq('foo bar')

    stream = new PassThrough()
    stream.write('foo bar')
    stream.destroy(new Error('foo-bar'))

    await expect(stream2buffer(stream)).to.eventually.be.rejectedWith('error converting stream - Error: foo-bar')
  })

  it('should guard by url', () => {
    expect(guard(/\/foo-bar/, '/foo-bar/hello-world.jpg')).to.eq(true)
    expect(guard(/\/foo-bar/, '/bar-foo/hello-world.jpg')).to.eq(false)
    expect(guard(/\/foo-bar/, undefined)).to.eq(false)
  })

  it('should validate payload', () => {
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).to.eq(true)
    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], new PassThrough())).to.eq(true)

    expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], 'foo bar')).to.eq(false)
    expect(validatePayload('image/avif', ['image/jpeg', 'image/png'], 'foo bar')).to.eq(false)
    expect(validatePayload(undefined, ['image/jpeg', 'image/png'], 'foo bar')).to.eq(false)

    expect(validatePayload([], ['foo'], 'bar')).to.eq(false)
    expect(validatePayload(42, ['foo'], 'bar')).to.eq(false)
  })

  it('should check if stream', () => {
    expect(isStream(new Stream())).to.eq(true)
    expect(isStream(Buffer.from(''))).to.eq(false)
    expect(isStream('')).to.eq(false)
  })
})

describe('utils - getBestFormat', () => {
  it('should select best format', () => {
    const formats = createFormats()

    const webpResult = getBestFormat('image/webp,image/avif', { hasAlpha: false }, formats)
    expect(webpResult !== false && webpResult.format).to.eq('webp')

    const pngResult = getBestFormat(undefined, { hasAlpha: true }, formats)
    expect(pngResult !== false && pngResult.format).to.eq('png')

    const limitedFormats: FastifyModernImagesOptionsCompression[] = [
      {
        enabled: false,
        format: 'avif',
        alpha: true,
        priority: 4,
        supported: accept => accept.includes('image/avif'),
      },
      {
        enabled: true,
        format: 'webp',
        alpha: true,
        priority: 3,
        supported: accept => accept.includes('image/webp'),
      },
    ]

    expect(getBestFormat('image/avif', { hasAlpha: false }, limitedFormats)).to.eq(false)
  })
})
