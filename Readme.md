# fastify-modern-images ![GitHub branch status](https://img.shields.io/github/checks-status/joberthel/fastify-modern-images/main) [![codecov](https://img.shields.io/codecov/c/gh/joberthel/fastify-modern-images?token=JSAR7F2AIF)](https://codecov.io/gh/joberthel/fastify-modern-images)

This fastify plugin will automatically transform your images to modern formats like `avif` or `webp`.

## Compatibility

-   Versions 0.7.x and above are compatible with fastify 5.x
-   Versions 0.2.x until 0.6.x are compatible with fastify 4.x
-   For fastify 3.x use version 0.1.x of this plugin

## Features

-   supports `avif`, `webp`, `jpeg` and `png`
-   changes format based on current browser
-   reduces quality automatically
-   resize images on the fly using query parameters

## Installation

```
npm i fastify-modern-images
```

## Usage

```js
const path = require('node:path')
const fastify = require('fastify')({
  logger: { level: 'trace' }
})

fastify
  .register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
  })
  .register(require('fastify-modern-images'), { quality: 7 })
  .listen({ port: 3000 }, (err) => {
    if (err)
      throw err
  })
```

## Options

```
{
    regex: /.*/, // If it is set will check this regex against request.raw.url (path + query string). Will only apply plugin if it is true.
    quality: '7', // Sets the default quality from '1' (worst), '2', ... '9' (best).
    maxDimension: 4096, // Maximum allowed width/height in pixels for resize query parameters.
    allowedDimensions: undefined, // Optional allowlist of permitted width/height values (e.g. [320, 640, 1280]).
    maxInputBytes: 50 * 1024 * 1024, // Maximum allowed input/output byte size when buffering streams or payloads.
    withoutEnlargement: true, // Do not enlarge if the width or height are already less than the specified dimensions.
    sharpInputOptions: {}, // Options passed to the sharp(buffer, options) constructor (e.g. limitInputPixels, failOn, sequentialRead).
    verifyRequest: undefined, // Optional (request) => boolean | Promise<boolean> callback; returning false skips transforms and serves the original payload.
    rembg: {
        enabled: false, // Must be set to true to enable AI background removal (?ai / ?a).
        model: 'isnet-general-use', // https://github.com/danielgatis/rembg#models
        allowedModels: undefined, // Optional allowlist of permitted rembg model names.
        timeoutMs: 30_000, // Timeout in milliseconds for rembg execution.
        concurrency: 2, // Maximum number of concurrent rembg processes.
        endpoint: undefined // Optional HTTP endpoint for a remote rembg service.
    },
    compression: {
        avif: {
            enabled: true, // Define if this format should be used.
            format: 'avif', // One of 'avif', 'webp', 'jpeg', 'png'.
            priority: 4, // Set a higher number to prefer a format over another one. Defaulting to avif -> webp -> jpeg -> png.
            alpha: true, // Define if the format supports images with an alpha layer.
            quality: { // Maps the overall quality to a quality specific for this format.
                '1': 50,
                '2': 55,
                ...
                '9': 95
            },
            options: {}, // Options which should be passed to sharp (https://sharp.pixelplumbing.com/api-output#parameters-5).
            contentType: 'image/avif', // Set the Content-Type header for this image format.
            supported: (accept: string) => boolean, // A function which checks based on the Accept-Header, if this image format is supported.
        },
        webp: { ... },
        jpeg: { ... },
        png: { ... }
    }
}
```

## Image transformation

You can add query parameters to the url to resize your images on the fly. Here are some examples.

```
http://localhost:3000/test.jpg?width=150
http://localhost:3000/test.jpg?height=150
http://localhost:3000/test.jpg?width=150&height=200
http://localhost:3000/test.jpg?width=150&height=200&fit=contain&background=red
http://localhost:3000/test.jpg?width=150&height=200&position=bottom
http://localhost:3000/test.jpg?rotation=45
http://localhost:3000/test.jpg?trim
```

You can also use short versions of the parameters.

```
http://localhost:3000/test.jpg?w=150
http://localhost:3000/test.jpg?h=150
http://localhost:3000/test.jpg?w=150&h=200
http://localhost:3000/test.jpg?w=150&h=200&f=contain&b=red
http://localhost:3000/test.jpg?w=150&h=200&p=bottom
http://localhost:3000/test.jpg?r=45
http://localhost:3000/test.jpg?t
```

Have a look at the [sharp documentation](https://sharp.pixelplumbing.com/api-resize#resize) for all available options.

When no explicit `rotation` / `r` parameter is specified, images are automatically oriented based on their EXIF orientation tag before EXIF metadata is stripped on output.

You can also set the quality via a query parameter:

```
http://localhost:3000/test.jpg?quality=9
http://localhost:3000/test.jpg?q=2
```

## AI Background Removal

AI background removal is disabled by default (`rembg.enabled: false`), so `?ai` / `?a` queries are ignored unless `rembg: { enabled: true }` is configured.

Make sure python and [rembg](https://github.com/danielgatis/rembg) is installed (or configure `rembg.endpoint` for a remote `rembg` service).

```
pip install rembg[cli]
```

Enable it when registering the plugin:

```js
app.register(fastifyModernImages, {
  rembg: {
    enabled: true,
  },
})
```

Examples:

```
http://localhost:3000/product.jpeg?ai
http://localhost:3000/product.jpeg?ai=u2netp // Define which model should be used.
http://localhost:3000/product.jpeg?ai&background=red
http://localhost:3000/product.jpeg?a // Short version
```

## Security & CDN Caching

Exposing arbitrary image transformation parameters (`width`, `height`, `rotation`, `quality`, etc.) on public endpoints can enable cache-busting DoS attacks that bypass CDNs and saturate `libvips` worker threads.

### Dimension Allowlist

Use `allowedDimensions` to restrict resize dimensions to a fixed set of presets:

```js
app.register(fastifyModernImages, {
  allowedDimensions: [320, 640, 1280, 1920],
})
```

### Request Verification (HMAC Signature)

Use `verifyRequest` to validate signed transformation URLs before any image processing runs. Returning `false` skips all transformations and serves the original payload unmodified:

```js
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.IMAGE_SIGNING_SECRET
if (!SECRET) {
  throw new Error('IMAGE_SIGNING_SECRET is required')
}

app.register(fastifyModernImages, {
  verifyRequest: (request) => {
    const { sig, ...params } = request.query
    if (typeof sig !== 'string' || sig.length === 0) {
      return false
    }
    if (Object.values(params).some(v => typeof v !== 'string')) {
      return false
    }

    const canonical = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')
    const pathname = (request.raw.url ?? request.url).split('?')[0]
    const expected = createHmac('sha256', SECRET).update(`${pathname}?${canonical}`).digest('hex')

    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  },
})
```

### CDN Caching Best Practices

- Place a CDN (e.g. Cloudflare, Fastly, CloudFront) in front of your Fastify service and include the `Accept` header and query string in the CDN cache key.
- Set `Cache-Control: public, max-age=31536000, immutable` on static image routes when using content-addressed URLs or signed transformation URLs.
- Pair `allowedDimensions` or `verifyRequest` with `maxInputBytes` and `sharpInputOptions.limitInputPixels` to bound memory and CPU per request.
