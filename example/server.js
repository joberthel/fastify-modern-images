'use strict';

const path = require('path');
const fastify = require('fastify')({ logger: { level: 'trace' } });

fastify
    .register(require('@fastify/static'), {
        root: path.join(__dirname, 'public'),
        prefix: '/'
    })
    .register(require('../dist'), { quality: 7 })
    .listen(3000, err => {
        if (err) throw err;
    });
