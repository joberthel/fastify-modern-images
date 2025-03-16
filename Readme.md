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
const path = require('path');
const fastify = require('fastify')({ logger: { level: 'trace' } });

fastify
    .register(require('@fastify/static'), {
        root: path.join(__dirname, 'public'),
        prefix: '/'
    })
    .register(require('fastify-modern-images'), { quality: 7 })
    .listen({ port: 3000 }, err => {
        if (err) throw err;
    });
```

## Options

```
{
    regex: /.*/, // If it is set will check this regex against the request path. Will only apply plugin if it is true.
    quality: '7', // Sets the default quality from '1' (worst), '2', ... '9' (best).
    rembg: {
        modal: 'u2netp' // https://github.com/danielgatis/rembg#models
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

You can also set the quality via a query parameter:

```
http://localhost:3000/test.jpg?quality=9
http://localhost:3000/test.jpg?q=2
```

# AI Background Removal

Make sure python and [rembg](https://github.com/danielgatis/rembg) is installed.

```
pip install rembg[cli]
```

Examples:

```
http://localhost:3000/product.jpeg?ai
http://localhost:3000/product.jpeg?ai=u2netp // Define which model should be used.
http://localhost:3000/product.jpeg?ai&background=red
http://localhost:3000/product.jpeg?a // Short version
```
