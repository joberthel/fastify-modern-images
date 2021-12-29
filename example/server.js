'use strict';

const path = require('path');
const fs = require('fs/promises');
const fastify = require('fastify')({ logger: { level: 'trace' } });

fastify
    .register(require('fastify-static'), {
        root: path.join(__dirname, 'public'),
        prefix: '/'
    })
    .register(require('../dist'), {})
    .get('/buffer_moscow_metro.jpg', async (request, reply) => {
        const buffer = await fs.readFile(path.join(__dirname, 'public', 'moscow_metro.jpg'));
        reply.header('Content-Type', 'image/jpeg').send(buffer);
    })
    .listen(3000, err => {
        if (err) throw err;
    });
