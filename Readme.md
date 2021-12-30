# fastify-modern-images [![CircleCI](https://img.shields.io/circleci/build/github/joberthel/fastify-modern-images/main)](https://circleci.com/gh/joberthel/fastify-modern-images/tree/main) [![codecov](https://img.shields.io/codecov/c/gh/joberthel/fastify-modern-images?token=JSAR7F2AIF)](https://codecov.io/gh/joberthel/fastify-modern-images)

## Features

-   supports avif, webp, jpeg and png
-   changes format based on current browser
-   reduces quality automatically

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
