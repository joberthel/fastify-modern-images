# fastify-modern-images [![CircleCI](https://img.shields.io/circleci/build/github/joberthel/fastify-modern-images/main)](https://circleci.com/gh/joberthel/fastify-modern-images/tree/main) [![codecov](https://img.shields.io/codecov/c/gh/joberthel/fastify-modern-images?token=JSAR7F2AIF)](https://codecov.io/gh/joberthel/fastify-modern-images)

This fastify plugin will automatically transform your images to modern formats like `avif` or `webp`.

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
const path = require('path');
const fastify = require('fastify')({ logger: { level: 'trace' } });

fastify
    .register(require('fastify-static'), {
        root: path.join(__dirname, 'public'),
        prefix: '/'
    })
    .register(require('fastify-modern-images'), { quality: 7 })
    .listen(3000, err => {
        if (err) throw err;
    });
```

## Options

```
{
    regex: /.*/, // If it is set will check this regex against the request path. Will only apply plugin if it is true.
    quality: '7', // Sets the default quality from '1' (worst), '2', ... '9' (best).
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
http://localhost:3000/test.jpg?width=150&height=200&fit=contain
http://localhost:3000/test.jpg?width=150&height=200&position=bottom
```

Have a look at the [sharp documentation](https://sharp.pixelplumbing.com/api-resize#resize) for all available options.

You can also set the quality via a query parameter:

```
http://localhost:3000/test.jpg?quality=9
```
