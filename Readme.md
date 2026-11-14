# fastify-modern-images

[![npm version](https://img.shields.io/npm/v/fastify-modern-images.svg?style=flat-square)](https://www.npmjs.com/package/fastify-modern-images)
[![Build Status](https://img.shields.io/github/actions/workflow/status/joberthel/fastify-modern-images/test.yml?branch=main&style=flat-square)](https://github.com/joberthel/fastify-modern-images/actions/workflows/test.yml)
[![codecov](https://img.shields.io/codecov/c/gh/joberthel/fastify-modern-images?style=flat-square)](https://codecov.io/gh/joberthel/fastify-modern-images)
[![License: MIT](https://img.shields.io/npm/l/fastify-modern-images.svg?style=flat-square)](./LICENSE)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

Fastify plugin, which converts images automatically into modern formats.

Built on top of [`sharp`](https://sharp.pixelplumbing.com/), `fastify-modern-images` intercepts outgoing image `Buffer` and `Stream` payloads in an `onSend` hook, negotiates the optimal format (`avif`, `webp`, `jpeg`, or `png`) from the client's `Accept` header, and performs on-the-fly resizing, rotation, trimming, and optional AI background removal via query parameters.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Usage](#usage)
- [Query Parameters](#query-parameters)
- [AI Background Removal](#ai-background-removal)
- [Security & CDN Caching](#security--cdn-caching)
- [API](#api)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Background

Serving unoptimized JPEG and PNG assets wastes bandwidth and hurts Core Web Vitals, while pre-generating every combination of format, resolution, and crop at build time complicates storage pipelines. `fastify-modern-images` solves this transparently at the HTTP layer: any route or static file server returning an image payload is automatically converted and resized on demand with built-in request coalescing, derived weak `ETag` generation, and early `304 Not Modified` short-circuiting.

## Features

- **Automatic Content Negotiation:** Selects `avif`, `webp`, `jpeg`, or `png` using RFC-compliant `Accept` header `q`-factor weights and configurable format priorities.
- **Transparency & Lossless Awareness:** Preserves alpha channels automatically, prevents opaque PNGs from silently converting to lossy JPEGs unless explicitly requested or flattened, and bypasses animated/multi-page images untouched.
- **On-the-Fly URL Transformations:** Resize (`width`/`height`), crop/pad (`fit`, `position`, `background`), rotate (`rotation`), adjust compression (`quality`), and trim borders (`trim`) via full or single-letter query parameters.
- **EXIF Auto-Orientation:** Automatically orients images based on their EXIF orientation tag before stripping metadata on output.
- **Early `304 Not Modified` & Derived ETags:** Computes deterministic weak ETags (`W/"..."`) from upstream ETags and transform parameters, short-circuiting `304` responses and destroying unread streams before invoking `sharp` or `rembg`.
- **In-Flight Request Coalescing:** Deduplicates concurrent identical transformation requests so `sharp` and `rembg` only run once per unique image and parameter set.
- **AI Background Removal:** Optional integration with [`rembg`](https://github.com/danielgatis/rembg) (via local CLI child processes or a remote HTTP endpoint) with concurrency limiting, timeouts, and automatic abort on client disconnect.
- **Hardened Against Abuse:** Built-in `maxDimension`, `allowedDimensions`, `maxInputBytes`, `sharpInputOptions.limitInputPixels`, and `verifyRequest` (e.g., HMAC URL signature verification), plus fail-safe query parsing.

## Compatibility

| Plugin Version | Fastify Version | Node.js Version |
| :--- | :--- | :--- |
| `0.7.x` and above | `5.x` | `>= 20.0.0` |
| `0.2.x` – `0.6.x` | `4.x` | `>= 18.0.0` |
| `0.1.x` | `3.x` | `>= 14.0.0` |

## Install

```bash
npm install fastify-modern-images
```

```bash
pnpm add fastify-modern-images
```

> [!NOTE]
> Requires **Node.js `>= 20.0.0`** and **`fastify` `^5.0.0`** as a peer dependency.

## Usage

### ESM / TypeScript

```ts
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import fastifyModernImages from 'fastify-modern-images'

const app = Fastify({
  logger: { level: 'info' },
})

await app.register(fastifyModernImages, {
  quality: '7',
  urlPattern: /^\/public\//,
})

await app.register(fastifyStatic, {
  root: path.join(import.meta.dirname, 'public'),
  prefix: '/public/',
})

await app.listen({ port: 3000 })
```

### CommonJS

```js
'use strict'

const path = require('node:path')
const fastify = require('fastify')({
  logger: { level: 'info' },
})

fastify
  .register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  })
  .register(require('fastify-modern-images'), { quality: 7 })
  .listen({ port: 3000 }, (err) => {
    if (err)
      throw err
  })
```

### Works with Custom Buffer and Stream Routes

Because `fastify-modern-images` operates in an `onSend` hook, it transforms any `GET` route that returns a `200` status code with a `Buffer` or `Readable` stream and a matching `Content-Type` (`image/jpeg`, `image/png`, `image/webp`, or `image/avif`):

```ts
import fs from 'node:fs'

app.get('/avatar.jpg', (_request, reply) => {
  reply.type('image/jpeg')
  return fs.createReadStream('./assets/avatar.jpg')
})
```

## Query Parameters

Append query parameters to any matching image URL to transform the image on the fly. Every parameter supports both a full name and a single-letter shorthand alias:

| Parameter | Shorthand | Valid Values | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `width` | `w` | `1` – `maxDimension` (`4096`) | — | Target width in pixels. Must be in `allowedDimensions` if configured. |
| `height` | `h` | `1` – `maxDimension` (`4096`) | — | Target height in pixels. Must be in `allowedDimensions` if configured. |
| `fit` | `f` | `'cover'`, `'contain'`, `'fill'`, `'inside'`, `'outside'` | `'cover'` | How the image should be resized to fit both `width` and `height`. |
| `position` | `p` | `'center'`, `'centre'`, `'top'`, `'right top'`, `'right'`, `'right bottom'`, `'bottom'`, `'left bottom'`, `'left'`, `'left top'`, `'north'`, `'northeast'`, `'east'`, `'southeast'`, `'south'`, `'southwest'`, `'west'`, `'northwest'`, `'entropy'`, `'attention'` | `'centre'` | Gravity or strategy used when `fit` is `'cover'` or `'contain'`. |
| `background` | `b` | Hex (`#fff`, `#ff00aa80`), `rgb()`/`rgba()`, `hsl()`/`hsla()`, or standard named CSS colors (`white`, `black`, `red`, `transparent`, etc.) | — | Background fill color for `fit=contain`, rotation corners, and alpha channel flattening. |
| `rotation` | `r` | `-360` – `360` (integer) | Auto (EXIF) | Explicit rotation angle in degrees. When omitted, auto-orients from EXIF metadata. |
| `trim` | `t` |*(empty)*, `'true'`, `'1'` (disable: `'false'`, `'0'`) | `false` | Trims "boring" homogeneous pixels from all edges prior to resizing. |
| `quality` | `q` | `'1'` (lowest) – `'9'` (highest) | `'7'` | Output compression quality tier mapped per target format. |
| `ai` | `a` | *(empty)* or `rembg` model name (e.g., `u2netp`) | — | Removes the image background via `rembg` (requires `rembg.enabled: true`). |

> [!TIP]
> Invalid query parameters (such as out-of-range numbers, unknown color strings, or duplicate array parameters) never cause a `500` error—they safely fall back to default values or skip resizing. If either `width` or `height` fails validation, both dimensions are ignored to prevent aspect-ratio distortion.

### Transformation Examples

```text
# Resize width or height while preserving aspect ratio
http://localhost:3000/test.jpg?width=150
http://localhost:3000/test.jpg?h=150

# Resize to 150x200 using contain fit and a red background
http://localhost:3000/test.jpg?width=150&height=200&fit=contain&background=red
http://localhost:3000/test.jpg?w=150&h=200&f=contain&b=red

# Crop with bottom gravity, rotate 45 degrees, trim borders, or adjust quality
http://localhost:3000/test.jpg?w=150&h=200&p=bottom
http://localhost:3000/test.jpg?rotation=45&background=white
http://localhost:3000/product.jpeg?trim
http://localhost:3000/test.jpg?quality=9
http://localhost:3000/test.jpg?q=3
```

See the [`sharp` resize documentation](https://sharp.pixelplumbing.com/api-resize#resize) for visual details on `fit` and `position` modes.

## AI Background Removal

AI background removal is disabled by default (`rembg.enabled: false`), meaning `?ai` and `?a` query parameters are ignored unless explicitly enabled.

### 1. Local CLI Setup (`rembg`)

Install Python and the [`rembg`](https://github.com/danielgatis/rembg) CLI on your host machine:

```bash
pip install "rembg[cli]"
```

Enable `rembg` when registering the plugin:

```ts
await app.register(fastifyModernImages, {
  rembg: {
    enabled: true,
    model: 'isnet-general-use',
    allowedModels: ['isnet-general-use', 'u2net', 'u2netp'],
    concurrency: 2,
    timeoutMs: 30_000,
  },
})
```

### 2. Remote HTTP Endpoint Setup

Alternatively, point `rembg.endpoint` to an external `rembg` HTTP service (the plugin sends a `POST` `multipart/form-data` request with `file` and `model` fields):

```ts
await app.register(fastifyModernImages, {
  rembg: {
    enabled: true,
    endpoint: 'http://localhost:7000/api/remove',
    timeoutMs: 15_000,
  },
})
```

### AI Query Examples

```text
# Remove background using the default configured model ('isnet-general-use')
http://localhost:3000/product.jpeg?ai
http://localhost:3000/product.jpeg?a

# Specify a custom model and replace the removed background with solid red
http://localhost:3000/product.jpeg?ai=u2netp&background=red
```

## Security & CDN Caching

> [!WARNING]
> Exposing unrestricted image transformation parameters (`width`, `height`, `rotation`, `quality`, `ai`) on public endpoints can enable cache-busting Denial-of-Service (DoS) attacks that bypass CDNs and saturate `libvips` or `rembg` worker processes.

### Dimension Allowlist

Use `allowedDimensions` to restrict `width` and `height` query parameters to a fixed set of responsive breakpoints:

```ts
await app.register(fastifyModernImages, {
  allowedDimensions: [320, 640, 1280, 1920],
})
```

### Request Verification (HMAC URL Signatures)

Use `verifyRequest` to validate signed transformation URLs before any stream buffering or image processing runs. Returning `false` skips all transformations and serves the original payload unmodified:

```ts
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.IMAGE_SIGNING_SECRET
if (!SECRET) {
  throw new Error('IMAGE_SIGNING_SECRET is required')
}

await app.register(fastifyModernImages, {
  verifyRequest: (request) => {
    const { sig, ...params } = request.query as Record<string, unknown>
    if (typeof sig !== 'string' || sig.length === 0) {
      return false
    }
    if (Object.values(params).some(v => typeof v !== 'string')) {
      return false
    }

    const canonical = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k] as string}`)
      .join('&')
    const pathname = (request.raw.url ?? request.url).split('?')[0]
    const expected = createHmac('sha256', SECRET)
      .update(`${pathname}?${canonical}`)
      .digest('hex')

    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  },
})
```

### CDN Caching Best Practices

- **Include `Accept` and Query String in Cache Keys:** Place a CDN (Cloudflare, Fastly, CloudFront) in front of Fastify and include both the `Accept` request header and the normalized query string in the CDN cache key. The plugin automatically sets `Vary: Accept` on all transformed responses.
- **Use Immutable Cache Headers:** Set `Cache-Control: public, max-age=31536000, immutable` on static image routes when using content-addressed filenames or HMAC-signed transformation URLs.
- **Bound Input Resources:** Pair `allowedDimensions` or `verifyRequest` with `maxInputBytes` and `sharpInputOptions.limitInputPixels` to cap memory and CPU consumption per request.

## API

### fastify.register(fastifyModernImages, options?)

Registers the `fastify-modern-images` plugin on a Fastify 5 instance.

#### options

Type: `FastifyModernImagesOptions`

Configuration options for filtering routes, setting quality defaults, bounding resource limits, and customizing format encoders.

##### urlPattern

Type: `RegExp`\
Default: `/.*/`

Regular expression tested against `request.raw.url` (pathname + query string). Only matching `GET` requests are processed by the plugin.

##### regex

Type: `RegExp`\
Default: `/.*/`

Backwards-compatible alias for [`urlPattern`](#urlpattern).

##### quality

Type: `'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | string | number`\
Default: `'7'`

Default compression quality tier from `'1'` (lowest) to `'9'` (highest) when no `?quality` or `?q` query parameter is provided.

##### maxDimension

Type: `number`\
Default: `4096`

Maximum allowed `width` or `height` in pixels for resize query parameters.

##### allowedDimensions

Type: `number[] | undefined`\
Default: `undefined`

Optional allowlist of permitted `width` and `height` pixel values (for example, `[320, 640, 1280]`). Any requested dimension outside this list is ignored.

##### maxInputBytes

Type: `number`\
Default: `52428800` *(50 MiB)*

Maximum allowed byte size when buffering incoming streams, reading input buffers, or reading `rembg` output. Exceeding this limit aborts the stream and returns an HTTP `500` error.

##### withoutEnlargement

Type: `boolean`\
Default: `true`

Do not enlarge the output image if the source image width or height is already smaller than the requested dimensions.

##### sharpInputOptions

Type: `sharp.SharpOptions | undefined`\
Default: `undefined`

Options forwarded directly to the `sharp(buffer, options)` constructor (such as `limitInputPixels`, `failOn`, or `sequentialRead`). If `limitInputPixels` is exceeded, the plugin throws an `InputLimitExceededError` (HTTP `500`).

##### verifyRequest

Type: `(request: FastifyRequest<ImageTransformRequest>) => boolean | Promise<boolean>`\
Default: `undefined`

Optional synchronous or asynchronous callback executed before stream buffering or image processing. Returning `false` bypasses all transformations and serves the original payload unmodified.

##### rembg

Type: `Partial<RembgOptions>`

Configuration for AI background removal (`?ai` / `?a`).

###### rembg.enabled

Type: `boolean`\
Default: `false`

Enable AI background removal via `?ai` / `?a` query parameters.

###### rembg.model

Type: `string`\
Default: `'isnet-general-use'`

Default `rembg` model used when `?ai` or `?a` is passed without a value. Model names must match `/^[a-z0-9][\w-]*$/i`.

###### rembg.allowedModels

Type: `string[] | undefined`\
Default: `undefined`

Optional allowlist of permitted `rembg` model names.

###### rembg.timeoutMs

Type: `number`\
Default: `30000`

Timeout in milliseconds for `rembg` execution before killing the child process (`SIGTERM` followed by `SIGKILL` after 5 seconds) or aborting the HTTP request.

###### rembg.concurrency

Type: `number`\
Default: `2`

Maximum number of concurrent `rembg` tasks allowed per plugin registration.

###### rembg.endpoint

Type: `string | undefined`\
Default: `undefined`

Optional URL of a remote `rembg` HTTP endpoint. When set, images are sent via HTTP `POST` (`multipart/form-data`) instead of spawning a local `rembg` child process.

##### compression

Type: `Record<'avif' | 'webp' | 'jpeg' | 'png' | string, Partial<CompressionConfig>>`

Per-format compression configuration overrides. Deep-merged with the built-in format defaults without mutating global state.

| Property | Type | Description |
| :--- | :--- | :--- |
| `enabled` | `boolean` | Whether this output format is enabled (default: `true` for all four formats). |
| `format` | `'avif' \| 'webp' \| 'jpeg' \| 'png'` | Target `sharp` format identifier. |
| `priority` | `number` | Tie-breaker priority when client `Accept` `q` weights are equal (`avif: 4`, `webp: 3`, `jpeg: 2`, `png: 1`). |
| `alpha` | `boolean` | Whether the format supports alpha transparency (`true` for `avif`, `webp`, `png`; `false` for `jpeg`). |
| `quality` | `Record<string, number>` | Maps quality tiers `'1'`–`'9'` to format-specific encoder quality values (`1`–`100`). |
| `options` | `sharp.AvifOptions \| sharp.WebpOptions \| sharp.JpegOptions \| sharp.PngOptions` | Additional encoder options passed to `sharp.toFormat(format, options)` (`avif` defaults to `{ effort: 3 }`). |
| `contentType` | `string` | `Content-Type` header value (`image/avif`, `image/webp`, `image/jpeg`, `image/png`). |
| `supported` | `(accept: string) => boolean` | Predicate determining whether the client's `Accept` header supports this format. |

###### Default Quality Mapping Table

| Format (`priority`) | `q=9` | `q=8` | `q=7` *(default)* | `q=6` | `q=5` | `q=4` | `q=3` | `q=2` | `q=1` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`avif`** (`4`) | `87` | `79` | **`70`** | `66` | `61` | `54` | `42` | `38` | `34` |
| **`webp`** (`3`) | `93` | `89` | **`84`** | `79` | `74` | `69` | `48` | `38` | `32` |
| **`jpeg`** (`2`) | `95` | `90` | **`85`** | `80` | `75` | `70` | `60` | `50` | `40` |
| **`png`** (`1`) | `87` | `78` | **`72`** | `68` | `63` | `61` | `55` | `52` | `48` |

## Maintainers

- [Johannes Berthel (@joberthel)](https://github.com/joberthel)

## Contributing

Questions, feedback, and bug reports are welcome on the [GitHub Issue Tracker](https://github.com/joberthel/fastify-modern-images/issues).

Pull Requests are accepted! Before submitting a PR, please review [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) and ensure the following checks pass locally:

```bash
pnpm install
pnpm build
pnpm test:coverage
pnpm test:e2e
pnpm lint
```

Commit messages are validated with `commitlint` and must follow [Conventional Commits](https://www.conventionalcommits.org/) (`<type>: <description>` without scopes, where `<type>` is one of `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, or `test`).

## License

[MIT](./LICENSE) © 2021 [Johannes Berthel](https://github.com/joberthel)
